import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Award, Plus, CheckCircle, AlertTriangle, Clock, XCircle,
  RefreshCw, FileText, Users, ChevronRight, Trash2, Edit2,
  ShieldCheck, Leaf, Globe, Star, BarChart2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/usePermission";

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? "";
function getToken() { return localStorage.getItem("coop_token") ?? ""; }

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
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
  { value: "rainforest_alliance", label: "Rainforest Alliance", icon: Leaf,       color: "text-green-600",  bg: "bg-green-50" },
  { value: "fairtrade",           label: "Fairtrade",           icon: Star,       color: "text-blue-600",   bg: "bg-blue-50" },
  { value: "bio",                 label: "Agriculture Bio",      icon: ShieldCheck,color: "text-emerald-600",bg: "bg-emerald-50" },
  { value: "eudr",                label: "EUDR",                 icon: Globe,      color: "text-orange-600", bg: "bg-orange-50" },
  { value: "utz",                 label: "UTZ",                  icon: Award,      color: "text-purple-600", bg: "bg-purple-50" },
  { value: "autre",               label: "Autre",                icon: FileText,   color: "text-gray-600",   bg: "bg-gray-50" },
];

const STATUTS = [
  { value: "actif",                    label: "Actif",                     icon: CheckCircle,  cls: "text-green-700 bg-green-50 border-green-200" },
  { value: "renouvellement_en_cours",  label: "Renouvellement en cours",   icon: RefreshCw,    cls: "text-blue-700 bg-blue-50 border-blue-200" },
  { value: "suspendu",                 label: "Suspendu",                  icon: AlertTriangle,cls: "text-amber-700 bg-amber-50 border-amber-200" },
  { value: "expire",                   label: "Expiré",                    icon: XCircle,      cls: "text-red-700 bg-red-50 border-red-200" },
];

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

// ─── Formulaire ───────────────────────────────────────────────────────────────

type CertifStatutEnum = "actif" | "suspendu" | "expire" | "renouvellement_en_cours";

const EMPTY_FORM: {
  type: string;
  nomCertificateur: string;
  numeroCertificat: string;
  dateObtention: string;
  dateExpiration: string;
  statut: CertifStatutEnum;
  superficieCertifieeHa: string;
  nbMembresCouVerts: string;
  lienDocument: string;
  notes: string;
} = {
  type: "rainforest_alliance",
  nomCertificateur: "",
  numeroCertificat: "",
  dateObtention: "",
  dateExpiration: "",
  statut: "actif",
  superficieCertifieeHa: "",
  nbMembresCouVerts: "",
  lienDocument: "",
  notes: "",
};

function CertifForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
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
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {initial?.type ? "Modifier la certification" : "Nouvelle certification"}
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.type}
                onChange={e => set("type", e.target.value)}
              >
                {TYPES_CERTIF.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.statut}
                onChange={e => set("statut", e.target.value as typeof EMPTY_FORM["statut"])}
              >
                {STATUTS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organisme certificateur</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.nomCertificateur}
                onChange={e => set("nomCertificateur", e.target.value)}
                placeholder="Ex. Bureau Veritas"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de certificat</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.numeroCertificat}
                onChange={e => set("numeroCertificat", e.target.value)}
                placeholder="Ex. RA-CI-00123"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date d'obtention</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.dateObtention}
                onChange={e => set("dateObtention", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date d'expiration</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.dateExpiration}
                onChange={e => set("dateExpiration", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Superficie certifiée (ha)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.superficieCertifieeHa}
                onChange={e => set("superficieCertifieeHa", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Membres couverts</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.nbMembresCouVerts}
                onChange={e => set("nbMembresCouVerts", e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lien document</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.lienDocument}
              onChange={e => set("lienDocument", e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Observations, conditions de renouvellement…"
            />
          </div>
        </div>
        <div className="p-6 border-t flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border rounded-lg"
          >
            Annuler
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={loading || !form.type}
            className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <RefreshCw size={14} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel de détail / audits ─────────────────────────────────────────────────

function AuditPanel({ certif, onClose }: { certif: Certification; onClose: () => void }) {
  const { data: audits = [] } = useQuery<AuditCertification[]>({
    queryKey: ["certif-audits", certif.id],
    queryFn: () => apiFetch(`/api/certifications/${certif.id}/audits`),
  });

  const typeInfo = getTypeInfo(certif.type);
  const statutInfo = getStatutInfo(certif.statut);
  const StatutIcon = statutInfo.icon;
  const TypeIcon = typeInfo.icon;
  const daysLeft = getDaysLeft(certif.dateExpiration);

  const ACTION_LABELS: Record<string, string> = {
    creation: "Création",
    modification: "Modification",
    renouvellement: "Renouvellement",
    suspension: "Suspension",
    expiration: "Expiration",
    suppression: "Suppression",
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="p-5 border-b flex items-start gap-3">
          <div className={`p-2 rounded-lg ${typeInfo.bg}`}>
            <TypeIcon size={20} className={typeInfo.color} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">{typeInfo.label}</h3>
            {certif.numeroCertificat && (
              <p className="text-xs text-gray-500 mt-0.5">{certif.numeroCertificat}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {/* Statut */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${statutInfo.cls}`}>
            <StatutIcon size={14} />
            {statutInfo.label}
            {daysLeft !== null && certif.statut === "actif" && (
              <span className="ml-auto text-xs font-normal">
                {daysLeft > 0 ? `expire dans ${daysLeft}j` : "expiré"}
              </span>
            )}
          </div>

          {/* Infos */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {certif.nomCertificateur && (
              <div>
                <span className="text-xs text-gray-500 block">Organisme</span>
                <span className="font-medium">{certif.nomCertificateur}</span>
              </div>
            )}
            {certif.dateObtention && (
              <div>
                <span className="text-xs text-gray-500 block">Obtenu le</span>
                <span className="font-medium">{fmtDate(certif.dateObtention)}</span>
              </div>
            )}
            {certif.dateExpiration && (
              <div>
                <span className="text-xs text-gray-500 block">Expire le</span>
                <span className={`font-medium ${daysLeft !== null && daysLeft <= 30 ? "text-red-600" : daysLeft !== null && daysLeft <= 60 ? "text-amber-600" : ""}`}>
                  {fmtDate(certif.dateExpiration)}
                </span>
              </div>
            )}
            {certif.superficieCertifieeHa && (
              <div>
                <span className="text-xs text-gray-500 block">Superficie</span>
                <span className="font-medium">{Number(certif.superficieCertifieeHa).toLocaleString("fr-FR")} ha</span>
              </div>
            )}
            {certif.nbMembresCouVerts !== null && certif.nbMembresCouVerts !== undefined && (
              <div>
                <span className="text-xs text-gray-500 block">Membres couverts</span>
                <span className="font-medium">{certif.nbMembresCouVerts.toLocaleString("fr-FR")}</span>
              </div>
            )}
          </div>

          {certif.notes && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
              {certif.notes}
            </div>
          )}

          {certif.lienDocument && (
            <a
              href={certif.lienDocument}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <FileText size={14} />
              Voir le document
            </a>
          )}

          {/* Historique */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Historique</h4>
            {audits.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun événement enregistré.</p>
            ) : (
              <div className="space-y-2">
                {audits.map(a => (
                  <div key={a.id} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="font-medium text-gray-800">
                        {ACTION_LABELS[a.action] ?? a.action}
                      </span>
                      {a.ancienStatut && a.nouveauStatut && a.ancienStatut !== a.nouveauStatut && (
                        <span className="text-gray-500 text-xs ml-1">
                          ({a.ancienStatut} → {a.nouveauStatut})
                        </span>
                      )}
                      {a.notes && <p className="text-gray-500 text-xs">{a.notes}</p>}
                      <p className="text-gray-400 text-xs">
                        {new Date(a.createdAt).toLocaleString("fr-FR", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
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

// ─── Page principale ──────────────────────────────────────────────────────────

export default function CertificationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = usePermission("certifications", "creer");

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

  const createMut = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) =>
      apiPost("/api/certifications", {
        ...data,
        nbMembresCouVerts: data.nbMembresCouVerts ? parseInt(data.nbMembresCouVerts) : null,
        superficieCertifieeHa: data.superficieCertifieeHa || null,
        dateObtention: data.dateObtention || null,
        dateExpiration: data.dateExpiration || null,
        nomCertificateur: data.nomCertificateur || null,
        numeroCertificat: data.numeroCertificat || null,
        lienDocument: data.lienDocument || null,
        notes: data.notes || null,
      }),
    onSuccess: () => {
      toast({ title: "Certification créée" });
      setShowCreate(false);
      invalidate();
    },
    onError: () => toast({ title: "Erreur lors de la création", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof EMPTY_FORM }) =>
      apiPut(`/api/certifications/${id}`, {
        ...data,
        nbMembresCouVerts: data.nbMembresCouVerts ? parseInt(data.nbMembresCouVerts) : null,
        superficieCertifieeHa: data.superficieCertifieeHa || null,
        dateObtention: data.dateObtention || null,
        dateExpiration: data.dateExpiration || null,
        nomCertificateur: data.nomCertificateur || null,
        numeroCertificat: data.numeroCertificat || null,
        lienDocument: data.lienDocument || null,
        notes: data.notes || null,
      }),
    onSuccess: () => {
      toast({ title: "Certification mise à jour" });
      setEditing(null);
      invalidate();
    },
    onError: () => toast({ title: "Erreur lors de la mise à jour", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/certifications/${id}`),
    onSuccess: () => {
      toast({ title: "Certification supprimée" });
      invalidate();
    },
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
            <Award className="text-green-600" size={26} />
            Certifications
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Rainforest Alliance, Fairtrade, Bio, EUDR et autres certifications
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
          >
            <Plus size={16} />
            Nouvelle certification
          </button>
        )}
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Total", value: stats.total, icon: Award, color: "text-gray-600", bg: "bg-gray-50" },
            { label: "Actives", value: stats.actives, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
            { label: "À renouveler", value: stats.aRenouveler, icon: RefreshCw, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Suspendues", value: stats.suspendues, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Expirées", value: stats.expirees, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
            { label: "Membres certifiés", value: stats.nbMembresCertifies, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
          ].map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-white rounded-xl border p-4">
                <div className={`p-2 rounded-lg ${k.bg} w-fit mb-2`}>
                  <Icon size={18} className={k.color} />
                </div>
                <div className="text-2xl font-bold text-gray-900">{k.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Alertes expirations proches */}
      {stats && stats.prochesExpiration.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">
              {stats.prochesExpiration.length} certification{stats.prochesExpiration.length > 1 ? "s" : ""} expir{stats.prochesExpiration.length > 1 ? "ent" : "e"} dans les 60 jours
            </h3>
          </div>
          <div className="space-y-2">
            {stats.prochesExpiration.map(c => {
              const days = getDaysLeft(c.dateExpiration);
              return (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-amber-800">{getTypeInfo(c.type).label}{c.numeroCertificat ? ` — ${c.numeroCertificat}` : ""}</span>
                  <span className={`font-medium ${days !== null && days <= 30 ? "text-red-700" : "text-amber-700"}`}>
                    {fmtDate(c.dateExpiration)} ({days}j)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={filterStatut}
          onChange={e => setFilterStatut(e.target.value)}
        >
          <option value="all">Tous les statuts</option>
          {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="all">Tous les types</option>
          {TYPES_CERTIF.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span className="text-sm text-gray-500 ml-auto">
          {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw size={20} className="animate-spin mr-2" />
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Award size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucune certification enregistrée</p>
          {canWrite && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
            >
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
              <div
                key={c.id}
                className="bg-white rounded-xl border hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setDetail(c)}
              >
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`p-2 rounded-lg ${typeInfo.bg} flex-shrink-0`}>
                      <TypeIcon size={20} className={typeInfo.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm">{typeInfo.label}</h3>
                      {c.nomCertificateur && (
                        <p className="text-xs text-gray-500 truncate">{c.nomCertificateur}</p>
                      )}
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statutInfo.cls}`}>
                      <StatutIcon size={11} />
                      {statutInfo.label}
                    </div>
                  </div>

                  {c.numeroCertificat && (
                    <p className="text-xs text-gray-500 mb-2">N° {c.numeroCertificat}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                    {c.dateObtention && (
                      <div>
                        <span className="block text-gray-400">Obtenu le</span>
                        <span className="font-medium text-gray-700">{fmtDate(c.dateObtention)}</span>
                      </div>
                    )}
                    {c.dateExpiration && (
                      <div>
                        <span className="block text-gray-400">Expire le</span>
                        <span className={`font-medium ${daysLeft !== null && daysLeft <= 30 ? "text-red-600" : daysLeft !== null && daysLeft <= 60 ? "text-amber-600" : "text-gray-700"}`}>
                          {fmtDate(c.dateExpiration)}
                          {daysLeft !== null && c.statut === "actif" && (
                            <span className="ml-1 text-gray-400">({daysLeft}j)</span>
                          )}
                        </span>
                      </div>
                    )}
                    {c.superficieCertifieeHa && (
                      <div>
                        <span className="block text-gray-400">Superficie</span>
                        <span className="font-medium text-gray-700">{Number(c.superficieCertifieeHa).toLocaleString("fr-FR")} ha</span>
                      </div>
                    )}
                    {c.nbMembresCouVerts !== null && c.nbMembresCouVerts !== undefined && (
                      <div>
                        <span className="block text-gray-400">Membres</span>
                        <span className="font-medium text-gray-700">{c.nbMembresCouVerts.toLocaleString("fr-FR")}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t">
                    <button
                      onClick={e => { e.stopPropagation(); setDetail(c); }}
                      className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"
                    >
                      Détails <ChevronRight size={12} />
                    </button>
                    {canWrite && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setEditing(c);
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (confirm(`Supprimer la certification ${typeInfo.label} ?`)) {
                              deleteMut.mutate(c.id);
                            }
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
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
            <BarChart2 size={16} className="text-gray-400" />
            Répartition par type
          </h3>
          <div className="space-y-2">
            {Object.entries(stats.parType).map(([type, nb]) => {
              const info = getTypeInfo(type);
              const pct = stats.total > 0 ? Math.round((nb / stats.total) * 100) : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className={`text-xs font-medium w-36 ${info.color}`}>{info.label}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full">
                    <div
                      className="h-2 rounded-full bg-green-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-6 text-right">{nb}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Formulaire création */}
      {showCreate && (
        <CertifForm
          onSubmit={data => createMut.mutate(data)}
          onCancel={() => setShowCreate(false)}
          loading={createMut.isPending}
        />
      )}

      {/* Formulaire édition */}
      {editing && (
        <CertifForm
          initial={{
            type: editing.type,
            nomCertificateur: editing.nomCertificateur ?? "",
            numeroCertificat: editing.numeroCertificat ?? "",
            dateObtention: editing.dateObtention ?? "",
            dateExpiration: editing.dateExpiration ?? "",
            statut: editing.statut,
            superficieCertifieeHa: editing.superficieCertifieeHa ?? "",
            nbMembresCouVerts: editing.nbMembresCouVerts?.toString() ?? "",
            lienDocument: editing.lienDocument ?? "",
            notes: editing.notes ?? "",
          }}
          onSubmit={data => updateMut.mutate({ id: editing.id, data })}
          onCancel={() => setEditing(null)}
          loading={updateMut.isPending}
        />
      )}

      {/* Panel détail / audits */}
      {detail && (
        <AuditPanel certif={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

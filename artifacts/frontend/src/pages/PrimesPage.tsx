import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Award, Plus, TrendingUp, Users, CheckCircle, Clock,
  ChevronRight, X, AlertTriangle, Loader2, Download,
  Leaf, Star, ShieldCheck, Gift, Heart, RotateCcw,
  Banknote, Check, ArrowLeft, Eye,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";

// ── API ───────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok  = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(`${BASE}${url}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${tok()}`,
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data as { erreur?: string }).erreur ?? "Erreur");
    return data;
  });

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campagne   { id: number; libelle: string; }
interface Exportateur { id: number; nom: string; }

interface Reception {
  id: number; typePrime: string; typePrimeLabel: string;
  montantTotalFcfa: number; dateReception: string; statut: string;
  exportateurNom: string | null; campagneLibelle: string | null;
  tonnageReferenceKg: string | null; notes: string | null;
}

interface Distribution {
  id: number; typePrime: string; typePrimeLabel: string;
  statut: string; dateDistribution: string;
  montantDistribueFcfa: number; montantBrutFcfa: number; montantFraisFcfa: number;
  tonnageTotalKg: string;
  exportateurNom: string | null; campagneLibelle: string | null;
  valideParNom: string | null;
  nbMembres: number; nbPayes: number;
}

interface PrimeMembre {
  id: number; membreId: number;
  membreNom: string; membrePrenoms: string; membreTelephone: string | null;
  tonnageKg: string; montantBrutFcfa: number;
  deductionAvancesFcfa: number; deductionFraisFcfa: number; montantNetFcfa: number;
  statut: string; modePaiement: string | null; datePaiement: string | null;
  referencePaiement: string | null; payeParNom: string | null;
}

interface DistributionDetail extends Distribution {
  membres: PrimeMembre[];
}

interface Stats {
  receptions: { total: number; montantTotal: number; enAttente: number };
  distributions: { total: number; brouillon: number; validees: number; payees: number };
  membres: { total: number; payes: number; montantDistribue: number; montantPaye: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtKg = (kg: string | number | null | undefined) =>
  kg ? new Intl.NumberFormat("fr-FR").format(parseFloat(String(kg))) + " kg" : "—";

const TYPE_META: Record<string, { label: string; Icon: typeof Leaf; color: string; bg: string; border: string }> = {
  certification_ra:        { label: "Rainforest Alliance", Icon: Leaf,      color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  certification_fairtrade: { label: "Fairtrade",           Icon: Star,      color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  certification_bio:       { label: "Agriculture Bio",     Icon: ShieldCheck,color: "text-emerald-700",bg: "bg-emerald-50",border: "border-emerald-200" },
  qualite:                 { label: "Prime de qualité",    Icon: Award,     color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
  fidelite:                { label: "Prime de fidélité",   Icon: Heart,     color: "text-pink-700",   bg: "bg-pink-50",   border: "border-pink-200" },
  ristourne:               { label: "Ristourne fin campagne", Icon: RotateCcw, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
};

const STATUT_DIST: Record<string, { label: string; cls: string }> = {
  brouillon: { label: "Brouillon",   cls: "bg-gray-100 text-gray-600" },
  validee:   { label: "Validée",     cls: "bg-blue-100 text-blue-700" },
  payee:     { label: "Payée",       cls: "bg-green-100 text-green-700" },
};

const STATUT_MEMBRE: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "En attente", cls: "bg-yellow-100 text-yellow-700" },
  paye:       { label: "Payé",       cls: "bg-green-100 text-green-700" },
  annule:     { label: "Annulé",     cls: "bg-red-100 text-red-600" },
};

const MODES_PAIEMENT = [
  { value: "especes",      label: "Espèces" },
  { value: "orange_money", label: "Orange Money" },
  { value: "mtn_momo",     label: "MTN MoMo" },
  { value: "wave",         label: "Wave" },
  { value: "cheque",       label: "Chèque" },
];

function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, Icon: Gift, color: "text-gray-700", bg: "bg-gray-50", border: "border-gray-200" };
}

// ── Modal Nouvelle Réception ──────────────────────────────────────────────────

function ModalReception({ campagnes, exportateurs, onClose, onCreated }: {
  campagnes: Campagne[]; exportateurs: Exportateur[];
  onClose: () => void; onCreated: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    typePrime: "certification_ra", campagneId: "", exportateurId: "",
    montantTotalFcfa: "", dateReception: new Date().toISOString().slice(0, 10),
    tonnageReferenceKg: "", notes: "",
  });

  const mut = useMutation({
    mutationFn: () => apiFetch("/api/primes/receptions", {
      method: "POST",
      body: JSON.stringify({
        typePrime: form.typePrime,
        campagneId: form.campagneId ? parseInt(form.campagneId) : null,
        exportateurId: form.exportateurId ? parseInt(form.exportateurId) : null,
        montantTotalFcfa: parseInt(form.montantTotalFcfa),
        dateReception: form.dateReception,
        tonnageReferenceKg: form.tonnageReferenceKg ? parseFloat(form.tonnageReferenceKg) : null,
        notes: form.notes || null,
      }),
    }),
    onSuccess: () => { toast({ title: "Prime enregistrée" }); onCreated(); onClose(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Enregistrer une prime reçue</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Type de prime *</label>
              <select value={form.typePrime} onChange={e => setForm(f => ({ ...f, typePrime: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300">
                {Object.entries(TYPE_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Campagne</label>
              <select value={form.campagneId} onChange={e => setForm(f => ({ ...f, campagneId: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300">
                <option value="">— Sélectionner —</option>
                {campagnes.map(c => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Exportateur</label>
              <select value={form.exportateurId} onChange={e => setForm(f => ({ ...f, exportateurId: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300">
                <option value="">— Sélectionner —</option>
                {exportateurs.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Montant total reçu (FCFA) *</label>
              <MoneyInput value={form.montantTotalFcfa}
                onChange={v => setForm(f => ({ ...f, montantTotalFcfa: v }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                placeholder="Ex : 2 775 000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date de réception *</label>
              <input type="date" value={form.dateReception}
                onChange={e => setForm(f => ({ ...f, dateReception: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Tonnage de référence (kg)</label>
              <input type="number" min="0" step="0.01" value={form.tonnageReferenceKg}
                onChange={e => setForm(f => ({ ...f, tonnageReferenceKg: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                placeholder="Tonnage total certifié exporté" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
                placeholder="Référence contrat, conditions…" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Annuler</button>
            <button disabled={mut.isPending || !form.montantTotalFcfa || !form.dateReception}
              onClick={() => mut.mutate()}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {mut.isPending && <Loader2 size={14} className="animate-spin" />}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal Nouvelle Distribution ───────────────────────────────────────────────

function ModalDistribution({ receptions, campagnes, onClose, onCreated }: {
  receptions: Reception[]; campagnes: Campagne[];
  onClose: () => void; onCreated: (id: number) => void;
}) {
  const { toast } = useToast();
  const receptionsDisponibles = receptions.filter(r => r.statut === "en_attente");
  const [form, setForm] = useState({
    primeReceptionId: receptionsDisponibles[0] ? String(receptionsDisponibles[0].id) : "",
    campagneId: "", dateDistribution: new Date().toISOString().slice(0, 10),
    montantFraisFcfa: "0", inclureDeductionAvances: false, notes: "",
  });

  const selectedRec = receptions.find(r => r.id === parseInt(form.primeReceptionId));

  const mut = useMutation({
    mutationFn: () => apiFetch("/api/primes/distributions", {
      method: "POST",
      body: JSON.stringify({
        primeReceptionId: parseInt(form.primeReceptionId),
        campagneId: form.campagneId ? parseInt(form.campagneId) : selectedRec?.campagneLibelle ? undefined : null,
        dateDistribution: form.dateDistribution,
        montantFraisFcfa: parseInt(form.montantFraisFcfa) || 0,
        inclureDeductionAvances: form.inclureDeductionAvances,
        notes: form.notes || null,
      }),
    }),
    onSuccess: (data: { id: number }) => {
      toast({ title: "Distribution créée — calcul effectué" });
      onCreated(data.id);
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Créer une distribution</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {receptionsDisponibles.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle size={14} />Toutes les primes enregistrées ont déjà été distribuées.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Prime à distribuer *</label>
              <select value={form.primeReceptionId}
                onChange={e => setForm(f => ({ ...f, primeReceptionId: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300">
                <option value="">— Sélectionner —</option>
                {receptionsDisponibles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.typePrimeLabel} — {fmt(r.montantTotalFcfa)} ({fmtDate(r.dateReception)})
                  </option>
                ))}
              </select>
              {selectedRec && (
                <p className="text-xs text-gray-500 mt-1">
                  Montant : <strong>{fmt(selectedRec.montantTotalFcfa)}</strong>
                  {selectedRec.campagneLibelle ? ` · Campagne : ${selectedRec.campagneLibelle}` : ""}
                </p>
              )}
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Campagne (pour calcul des tonnages) *</label>
              <select value={form.campagneId} onChange={e => setForm(f => ({ ...f, campagneId: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300">
                <option value="">— Sélectionner —</option>
                {campagnes.map(c => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-0.5">Les tonnages livrés dans cette campagne servent de base au calcul des parts</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Frais de certification à déduire (FCFA)</label>
              <MoneyInput value={form.montantFraisFcfa}
                onChange={v => setForm(f => ({ ...f, montantFraisFcfa: v }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date de distribution *</label>
              <input type="date" value={form.dateDistribution}
                onChange={e => setForm(f => ({ ...f, dateDistribution: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="deductAvances" checked={form.inclureDeductionAvances}
                onChange={e => setForm(f => ({ ...f, inclureDeductionAvances: e.target.checked }))}
                className="rounded border-gray-300" />
              <label htmlFor="deductAvances" className="text-sm text-gray-700">
                Déduire les avances non remboursées de chaque membre
              </label>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <strong>Calcul automatique :</strong> Prime × (tonnage membre / tonnage total) = part de chaque membre
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Annuler</button>
            <button
              disabled={mut.isPending || !form.primeReceptionId || !form.campagneId || !form.dateDistribution}
              onClick={() => mut.mutate()}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {mut.isPending ? <><Loader2 size={14} className="animate-spin" />Calcul en cours…</> : "Calculer & créer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal Paiement membre ─────────────────────────────────────────────────────

function ModalPaiement({ membre, onClose, onPaid }: {
  membre: PrimeMembre; onClose: () => void; onPaid: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    modePaiement: "especes",
    datePaiement: new Date().toISOString().slice(0, 10),
    referencePaiement: "", notes: "",
  });
  const mut = useMutation({
    mutationFn: () => apiFetch(`/api/primes/membres/${membre.id}/payer`, {
      method: "PATCH",
      body: JSON.stringify({ ...form, referencePaiement: form.referencePaiement || null }),
    }),
    onSuccess: () => { toast({ title: "Paiement enregistré" }); onPaid(); onClose(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-sm">Payer {membre.membrePrenoms} {membre.membreNom}</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <p className="text-xs text-green-700">Montant net à verser</p>
            <p className="text-xl font-bold text-green-800">{fmt(membre.montantNetFcfa)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mode de paiement</label>
            <select value={form.modePaiement} onChange={e => setForm(f => ({ ...f, modePaiement: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              {MODES_PAIEMENT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date de paiement</label>
            <input type="date" value={form.datePaiement} onChange={e => setForm(f => ({ ...f, datePaiement: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Référence (N° reçu / transaction)</label>
            <input value={form.referencePaiement} onChange={e => setForm(f => ({ ...f, referencePaiement: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="Optionnel" />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Annuler</button>
            <button disabled={mut.isPending} onClick={() => mut.mutate()}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {mut.isPending && <Loader2 size={14} className="animate-spin" />}Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Vue détail distribution ───────────────────────────────────────────────────

function DistributionDetail({ id, onBack, onRefresh }: {
  id: number; onBack: () => void; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canValider = usePermission("primes", "valider");
  const canPayer   = usePermission("primes", "payer");
  const [payMembre, setPayMembre] = useState<PrimeMembre | null>(null);
  const [showBulkPay, setShowBulkPay] = useState(false);
  const [bulkForm, setBulkForm] = useState({ modePaiement: "especes", datePaiement: new Date().toISOString().slice(0, 10) });

  const { data: dist, isLoading } = useQuery<DistributionDetail>({
    queryKey: ["primes-distribution", id],
    queryFn: () => apiFetch(`/api/primes/distributions/${id}`),
  });

  const refetchDist = () => {
    void qc.invalidateQueries({ queryKey: ["primes-distribution", id] });
    void qc.invalidateQueries({ queryKey: ["primes-distributions"] });
    onRefresh();
  };

  const validerMut = useMutation({
    mutationFn: () => apiFetch(`/api/primes/distributions/${id}/valider`, { method: "POST", body: "{}" }),
    onSuccess: () => { toast({ title: "Distribution validée" }); refetchDist(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const bulkPayMut = useMutation({
    mutationFn: () => apiFetch(`/api/primes/distributions/${id}/payer-tous`, {
      method: "POST", body: JSON.stringify(bulkForm),
    }),
    onSuccess: () => { toast({ title: "Tous les membres ont été payés" }); setShowBulkPay(false); refetchDist(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-600" /></div>;
  if (!dist) return <div className="text-center py-16 text-gray-400">Distribution introuvable</div>;

  const meta = typeMeta(dist.typePrime);
  const Icon = meta.Icon;
  const statutDist = STATUT_DIST[dist.statut] ?? { label: dist.statut, cls: "bg-gray-100 text-gray-600" };
  const nbEnAttente = dist.membres.filter(m => m.statut === "en_attente").length;
  const pct = dist.membres.length > 0 ? Math.round((dist.nbPayes / dist.membres.length) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={16} />
        </button>
        <div className={`p-2 rounded-lg ${meta.bg}`}><Icon size={18} className={meta.color} /></div>
        <div className="flex-1">
          <h2 className="font-bold text-gray-900">{meta.label}</h2>
          <p className="text-xs text-gray-500">{fmtDate(dist.dateDistribution)}{dist.campagneLibelle ? ` · ${dist.campagneLibelle}` : ""}</p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statutDist.cls}`}>{statutDist.label}</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Montant total", val: fmt(dist.montantBrutFcfa),      cls: "text-gray-900" },
          { label: "Frais déduits", val: fmt(dist.montantFraisFcfa),     cls: "text-red-600" },
          { label: "À distribuer",  val: fmt(dist.montantDistribueFcfa), cls: "text-green-700" },
          { label: "Tonnage total", val: fmtKg(dist.tonnageTotalKg),     cls: "text-gray-700" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={`text-base font-bold ${k.cls}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Barre progression paiement */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium text-gray-700">Paiements membres</span>
          <span className="text-gray-500">{dist.nbPayes}/{dist.membres.length} payés ({pct}%)</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {dist.statut === "brouillon" && canValider && (
          <button disabled={validerMut.isPending} onClick={() => validerMut.mutate()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {validerMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Valider la distribution
          </button>
        )}
        {dist.statut !== "brouillon" && nbEnAttente > 0 && canPayer && (
          <button onClick={() => setShowBulkPay(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            <Banknote size={14} />Payer tous ({nbEnAttente} membres)
          </button>
        )}
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <Download size={14} />Rapport PDF
        </button>
      </div>

      {/* Alerte brouillon */}
      {dist.statut === "brouillon" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle size={14} />La distribution doit être <strong>validée par la direction</strong> avant de pouvoir effectuer les paiements.
        </div>
      )}

      {/* Table membres */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Membre</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Tonnage</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Montant brut</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Déductions</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 font-bold">Montant net</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {dist.membres.map(m => {
              const sm = STATUT_MEMBRE[m.statut] ?? { label: m.statut, cls: "bg-gray-100 text-gray-600" };
              const totalDeduct = m.deductionAvancesFcfa + m.deductionFraisFcfa;
              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{m.membreNom} {m.membrePrenoms}</div>
                    {m.membreTelephone && <div className="text-xs text-gray-400">{m.membreTelephone}</div>}
                    {m.statut === "paye" && m.modePaiement && (
                      <div className="text-xs text-green-700 mt-0.5">
                        {MODES_PAIEMENT.find(p => p.value === m.modePaiement)?.label ?? m.modePaiement}
                        {m.referencePaiement ? ` · ${m.referencePaiement}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtKg(m.tonnageKg)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{new Intl.NumberFormat("fr-FR").format(m.montantBrutFcfa)}</td>
                  <td className="px-4 py-3 text-right text-red-600 text-xs">
                    {totalDeduct > 0 ? `-${new Intl.NumberFormat("fr-FR").format(totalDeduct)}` : "—"}
                    {m.deductionAvancesFcfa > 0 && <div className="text-red-400">avances</div>}
                    {m.deductionFraisFcfa > 0 && <div className="text-red-400">frais</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-green-800">
                    {new Intl.NumberFormat("fr-FR").format(m.montantNetFcfa)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.label}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {m.statut === "en_attente" && dist.statut !== "brouillon" && canPayer && (
                      <button onClick={() => setPayMembre(m)}
                        className="text-xs text-green-700 hover:text-green-900 font-medium flex items-center gap-1 mx-auto">
                        <Banknote size={12} />Payer
                      </button>
                    )}
                    {m.statut === "paye" && (
                      <span className="text-green-600"><Check size={14} /></span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-200 bg-gray-50">
            <tr>
              <td className="px-4 py-3 font-semibold text-gray-700">Total ({dist.membres.length} membres)</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-700">{fmtKg(dist.tonnageTotalKg)}</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-700">{new Intl.NumberFormat("fr-FR").format(dist.membres.reduce((s, m) => s + m.montantBrutFcfa, 0))}</td>
              <td className="px-4 py-3 text-right font-semibold text-red-600">
                -{new Intl.NumberFormat("fr-FR").format(dist.membres.reduce((s, m) => s + m.deductionAvancesFcfa + m.deductionFraisFcfa, 0))}
              </td>
              <td className="px-4 py-3 text-right font-bold text-green-800 text-base">
                {new Intl.NumberFormat("fr-FR").format(dist.membres.reduce((s, m) => s + m.montantNetFcfa, 0))}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Modal paiement individuel */}
      {payMembre && (
        <ModalPaiement
          membre={payMembre}
          onClose={() => setPayMembre(null)}
          onPaid={() => { refetchDist(); setPayMembre(null); }}
        />
      )}

      {/* Modal payer tous */}
      {showBulkPay && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-sm">Payer tous les membres en attente</h3>
              <button onClick={() => setShowBulkPay(false)}><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mode de paiement</label>
                <select value={bulkForm.modePaiement} onChange={e => setBulkForm(f => ({ ...f, modePaiement: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                  {MODES_PAIEMENT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date de paiement</label>
                <input type="date" value={bulkForm.datePaiement} onChange={e => setBulkForm(f => ({ ...f, datePaiement: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                {nbEnAttente} membre{nbEnAttente > 1 ? "s" : ""} en attente · {fmt(dist.membres.filter(m => m.statut === "en_attente").reduce((s, m) => s + m.montantNetFcfa, 0))} à verser
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowBulkPay(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Annuler</button>
                <button disabled={bulkPayMut.isPending} onClick={() => bulkPayMut.mutate()}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {bulkPayMut.isPending && <Loader2 size={14} className="animate-spin" />}Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function PrimesPage() {
  const canCreate  = usePermission("primes", "creer");
  const qc         = useQueryClient();
  const [tab, setTab]           = useState<"receptions" | "distributions">("receptions");
  const [showRecModal, setShowRecModal] = useState(false);
  const [showDistModal, setShowDistModal] = useState(false);
  const [detailDistId, setDetailDistId]  = useState<number | null>(null);

  const { data: stats }       = useQuery<Stats>({         queryKey: ["primes-stats"],         queryFn: () => apiFetch("/api/primes/stats") });
  const { data: receptions = [] } = useQuery<Reception[]>({ queryKey: ["primes-receptions"],     queryFn: () => apiFetch("/api/primes/receptions") });
  const { data: distributions = [] } = useQuery<Distribution[]>({ queryKey: ["primes-distributions"], queryFn: () => apiFetch("/api/primes/distributions") });
  const { data: campagnes = [] }    = useQuery<Campagne[]>({ queryKey: ["campagnes-list"],  queryFn: () => apiFetch("/api/campagnes") });
  const { data: exportateurs = [] } = useQuery<Exportateur[]>({ queryKey: ["exportateurs-list"], queryFn: () => apiFetch("/api/exportateurs") });

  const refetchAll = () => {
    void qc.invalidateQueries({ queryKey: ["primes-stats"] });
    void qc.invalidateQueries({ queryKey: ["primes-receptions"] });
    void qc.invalidateQueries({ queryKey: ["primes-distributions"] });
  };

  // ── Vue détail ──────────────────────────────────────────────────────────────
  if (detailDistId !== null) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <DistributionDetail id={detailDistId} onBack={() => setDetailDistId(null)} onRefresh={refetchAll} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Gift className="text-green-600" size={26} />Primes & Redistribution
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Traçabilité des primes et redistribution aux membres selon tonnage livré</p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <button onClick={() => setShowRecModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-green-600 text-green-700 rounded-lg hover:bg-green-50 text-sm font-medium">
              <Plus size={15} />Prime reçue
            </button>
            <button onClick={() => setShowDistModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              <TrendingUp size={15} />Distribuer
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total primes reçues",    val: fmt(stats.receptions.montantTotal), icon: TrendingUp,  color: "text-blue-600",   bg: "bg-blue-50" },
            { label: "En attente de redistrib.",val: stats.receptions.enAttente,         icon: Clock,        color: "text-amber-600",  bg: "bg-amber-50",   suffix: " prime(s)" },
            { label: "Distributions créées",   val: stats.distributions.total,           icon: Users,        color: "text-purple-600", bg: "bg-purple-50",  suffix: "" },
            { label: "Payé aux membres",       val: fmt(stats.membres.montantPaye),     icon: CheckCircle,  color: "text-green-600",  bg: "bg-green-50" },
          ].map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className={`p-2 rounded-lg ${k.bg} w-fit mb-2`}><Icon size={18} className={k.color} /></div>
                <div className="text-xl font-bold text-gray-900">{k.val}{k.suffix ?? ""}</div>
                <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-0 border-b border-gray-200">
        {(["receptions", "distributions"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t === "receptions" ? `Primes reçues (${receptions.length})` : `Distributions (${distributions.length})`}
          </button>
        ))}
      </div>

      {/* Tab : Réceptions */}
      {tab === "receptions" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          {receptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
              <Gift size={40} className="opacity-30" />
              <p className="text-sm">Aucune prime enregistrée. Commencez par enregistrer une prime reçue d'un exportateur.</p>
              {canCreate && (
                <button onClick={() => setShowRecModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  <Plus size={14} />Enregistrer une prime
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Campagne / Exportateur</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Montant reçu</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Date réception</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {receptions.map(r => {
                  const meta = typeMeta(r.typePrime);
                  const Icon = meta.Icon;
                  const isDistrib = r.statut === "distribuee";
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${meta.bg}`}><Icon size={13} className={meta.color} /></div>
                          <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell text-xs">
                        {r.campagneLibelle && <div>{r.campagneLibelle}</div>}
                        {r.exportateurNom && <div className="text-gray-400">{r.exportateurNom}</div>}
                        {!r.campagneLibelle && !r.exportateurNom && "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(r.montantTotalFcfa)}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{fmtDate(r.dateReception)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${isDistrib ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {isDistrib ? "Distribuée" : "En attente"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab : Distributions */}
      {tab === "distributions" && (
        <div className="space-y-3">
          {distributions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
              <TrendingUp size={40} className="opacity-30" />
              <p className="text-sm">Aucune distribution. Créez-en une depuis une prime enregistrée.</p>
              {canCreate && (
                <button onClick={() => setShowDistModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  <Plus size={14} />Créer une distribution
                </button>
              )}
            </div>
          ) : distributions.map(d => {
            const meta = typeMeta(d.typePrime);
            const Icon = meta.Icon;
            const sd   = STATUT_DIST[d.statut] ?? { label: d.statut, cls: "bg-gray-100 text-gray-600" };
            const pct  = d.nbMembres > 0 ? Math.round((d.nbPayes / d.nbMembres) * 100) : 0;
            return (
              <div key={d.id}
                onClick={() => setDetailDistId(d.id)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${meta.bg}`}><Icon size={16} className={meta.color} /></div>
                    <div>
                      <p className={`text-sm font-semibold ${meta.color}`}>{meta.label}</p>
                      <p className="text-xs text-gray-500">
                        {fmtDate(d.dateDistribution)}
                        {d.campagneLibelle ? ` · ${d.campagneLibelle}` : ""}
                        {d.exportateurNom ? ` · ${d.exportateurNom}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sd.cls}`}>{sd.label}</span>
                    <ChevronRight size={16} className="text-gray-400" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
                  <div>
                    <p className="text-gray-400">Montant</p>
                    <p className="font-semibold text-gray-900">{fmt(d.montantDistribueFcfa)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Membres</p>
                    <p className="font-semibold text-gray-900">{d.nbMembres}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Tonnage</p>
                    <p className="font-semibold text-gray-900">{fmtKg(d.tonnageTotalKg)}</p>
                  </div>
                </div>
                {d.nbMembres > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Paiements</span>
                      <span>{d.nbPayes}/{d.nbMembres} payés</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showRecModal  && <ModalReception campagnes={campagnes} exportateurs={exportateurs} onClose={() => setShowRecModal(false)} onCreated={refetchAll} />}
      {showDistModal && <ModalDistribution receptions={receptions} campagnes={campagnes} onClose={() => setShowDistModal(false)} onCreated={id => { refetchAll(); setDetailDistId(id); }} />}
    </div>
  );
}

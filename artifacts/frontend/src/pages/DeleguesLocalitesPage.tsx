import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Users, Search, Phone, MapPin, Wallet, PlusCircle, X,
  ChevronRight, AlertCircle, CalendarDays, TrendingUp, Settings,
  CheckCircle2, Clock, Banknote, Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { usePermission } from "@/hooks/usePermission";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
  return r.json();
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
  return r.json();
}
async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok && r.status !== 204) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
}

interface MembreDelegue {
  id: number;
  nom: string;
  prenoms: string | null;
  telephone: string;
  section: string | null;
  village: string | null;
  categorieMembre: string | null;
  statutMembre: string;
  numeroMembre: number;
}

interface Avance {
  id: number;
  membreId: number;
  montantOctroyeFcfa: number;
  soldeRestantFcfa: number;
  statut: "en_cours" | "rembourse" | "en_retard";
  dateOctroi: string;
  motif: string | null;
}

interface CommissionRecap {
  membreId: number;
  nom: string;
  prenoms: string | null;
  section: string | null;
  village: string | null;
  enAttenteFcfa: number;
  totalPayeFcfa: number;
  totalFcfa: number;
  nb: number;
}

interface Commission {
  id: number;
  membreDelegueId: number;
  sessionPeseeId: number | null;
  campagneId: number | null;
  tauxFcfaParKg: number;
  poidsKg: number;
  montantFcfa: number;
  retenueAvancesFcfa: number;
  statut: string;
  datePaiement: string | null;
  modePaiement: string | null;
  referencePaiement: string | null;
  createdAt: string;
}

interface TauxCommission {
  id: number;
  cooperativeId: number;
  campagneId: number | null;
  membreDelegueId: number | null;
  tauxFcfaParKg: number;
  dateDebut: string;
  dateFin: string | null;
  actif: boolean;
  membreNom: string | null;
  membrePrenoms: string | null;
}

function formaterMontant(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " F";
}
function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

type Onglet = "membres" | "commissions" | "taux";

export default function DeleguesLocalitesPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const peutOctroyer = usePermission("avances", "octroyer");
  const peutModifier = usePermission("delegues", "modifier");

  const [onglet, setOnglet] = useState<Onglet>("membres");
  const [search, setSearch] = useState("");
  const [modalMembre, setModalMembre] = useState<MembreDelegue | null>(null);
  const [showOctroi, setShowOctroi] = useState(false);
  const [formOctroi, setFormOctroi] = useState({ montant: "", dateOctroi: new Date().toISOString().split("T")[0]!, dateEcheance: "", motif: "" });
  const [errOctroi, setErrOctroi] = useState("");

  // ── Commission : modal paiement ───────────────────────────────────────────
  const [modalCommission, setModalCommission] = useState<CommissionRecap | null>(null);
  const [detailCommissions, setDetailCommissions] = useState<Commission[]>([]);
  const [avancesModalComm, setAvancesModalComm] = useState<Avance[]>([]);
  const [formPayer, setFormPayer] = useState({ modePaiement: "especes", referencePaiement: "" });
  const [errPayer, setErrPayer] = useState("");

  // ── Taux : formulaire ─────────────────────────────────────────────────────
  const [showTauxForm, setShowTauxForm] = useState(false);
  const [formTaux, setFormTaux] = useState({
    membreDelegueId: "" as string,
    tauxFcfaParKg: "",
    dateDebut: new Date().toISOString().split("T")[0]!,
    dateFin: "",
    actif: true,
  });
  const [errTaux, setErrTaux] = useState("");

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: result, isLoading } = useQuery<{ membres: MembreDelegue[]; total: number }>({
    queryKey: ["delegues-localites"],
    queryFn: () => apiFetch(`/api/membres?categorie_membre=d%C3%A9l%C3%A9gu%C3%A9+de+localit%C3%A9s&limit=200&statut_membre=actif`),
    staleTime: 30_000,
  });

  const membres = result?.membres ?? [];

  const { data: toutesAvances = [] } = useQuery<Avance[]>({
    queryKey: ["avances-delegues-localites"],
    queryFn: () => apiFetch(`/api/avances`),
    staleTime: 30_000,
  });

  const avancesParMembre = new Map<number, Avance[]>();
  for (const a of toutesAvances) {
    if (!avancesParMembre.has(a.membreId)) avancesParMembre.set(a.membreId, []);
    avancesParMembre.get(a.membreId)!.push(a);
  }

  function soldeAvances(membreId: number): number {
    return (avancesParMembre.get(membreId) ?? [])
      .filter(a => a.statut !== "rembourse")
      .reduce((s, a) => s + a.soldeRestantFcfa, 0);
  }

  const { data: avancesModal = [], isLoading: loadAvances } = useQuery<Avance[]>({
    queryKey: ["avances-membre", modalMembre?.id],
    queryFn: () => apiFetch(`/api/avances?membre_id=${modalMembre!.id}`),
    enabled: !!modalMembre,
    staleTime: 0,
  });

  const { data: recapCommissions = [], isLoading: loadRecap } = useQuery<CommissionRecap[]>({
    queryKey: ["commissions-membres-delegues-recap"],
    queryFn: () => apiFetch(`/api/delegues-localites/commissions/recap`),
    enabled: onglet === "commissions",
    staleTime: 30_000,
  });

  const { data: taux = [], isLoading: loadTaux } = useQuery<TauxCommission[]>({
    queryKey: ["commissions-membres-delegues-taux"],
    queryFn: () => apiFetch(`/api/delegues-localites/commissions/taux`),
    enabled: onglet === "taux",
    staleTime: 30_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const mutOctroyer = useMutation({
    mutationFn: () => apiPost("/api/avances", {
      membreId: modalMembre!.id,
      montantOctroyeFcfa: parseInt(formOctroi.montant),
      dateOctroi: formOctroi.dateOctroi,
      dateEcheance: formOctroi.dateEcheance || undefined,
      motif: formOctroi.motif || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avances-membre", modalMembre?.id] });
      qc.invalidateQueries({ queryKey: ["avances-delegues-localites"] });
      setShowOctroi(false);
      setFormOctroi({ montant: "", dateOctroi: new Date().toISOString().split("T")[0]!, dateEcheance: "", motif: "" });
      setErrOctroi("");
    },
    onError: (e: Error) => setErrOctroi(e.message),
  });

  const mutPayer = useMutation({
    mutationFn: () => apiPost<{ montantTotal: number; totalRetenu: number; montantNet: number; nb: number }>(
      `/api/delegues-localites/${modalCommission!.membreId}/commissions/payer`, {
        modePaiement: formPayer.modePaiement,
        referencePaiement: formPayer.referencePaiement || undefined,
      }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commissions-membres-delegues-recap"] });
      qc.invalidateQueries({ queryKey: ["avances-delegues-localites"] });
      setModalCommission(null);
      setDetailCommissions([]);
      setAvancesModalComm([]);
      setErrPayer("");
    },
    onError: (e: Error) => setErrPayer(e.message),
  });

  const mutAjouterTaux = useMutation({
    mutationFn: () => apiPost("/api/delegues-localites/commissions/taux", {
      membreDelegueId: formTaux.membreDelegueId ? Number(formTaux.membreDelegueId) : null,
      tauxFcfaParKg: Number(formTaux.tauxFcfaParKg),
      dateDebut: formTaux.dateDebut,
      dateFin: formTaux.dateFin || null,
      actif: formTaux.actif,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commissions-membres-delegues-taux"] });
      setShowTauxForm(false);
      setFormTaux({ membreDelegueId: "", tauxFcfaParKg: "", dateDebut: new Date().toISOString().split("T")[0]!, dateFin: "", actif: true });
      setErrTaux("");
    },
    onError: (e: Error) => setErrTaux(e.message),
  });

  const mutSupprimerTaux = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/delegues-localites/commissions/taux/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commissions-membres-delegues-taux"] }),
  });

  // ── Chargement détail commissions pour modal paiement ─────────────────────
  async function ouvrirModalCommission(recap: CommissionRecap) {
    setModalCommission(recap);
    setErrPayer("");
    setAvancesModalComm([]);
    try {
      const [commData, avancesData] = await Promise.all([
        apiFetch<Commission[]>(`/api/delegues-localites/${recap.membreId}/commissions`),
        apiFetch<Avance[]>(`/api/avances?membre_id=${recap.membreId}`),
      ]);
      setDetailCommissions(commData.filter(c => c.statut === "en_attente"));
      setAvancesModalComm(avancesData.filter(a => a.statut !== "rembourse"));
    } catch {
      setDetailCommissions([]);
    }
  }

  // ── Filtrage ──────────────────────────────────────────────────────────────
  const filtres = membres.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.nom.toLowerCase().includes(q) ||
      (m.prenoms ?? "").toLowerCase().includes(q) ||
      m.telephone.includes(q) ||
      (m.section ?? "").toLowerCase().includes(q) ||
      (m.village ?? "").toLowerCase().includes(q)
    );
  });

  const totalEnAttente = recapCommissions.reduce((s, r) => s + r.enAttenteFcfa, 0);

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Délégués de localités</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Membres de catégorie "Délégué de localités" — {result?.total ?? 0} au total
          </p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: "membres" as Onglet,     label: "Membres",     icon: Users },
          { id: "commissions" as Onglet, label: "Commissions", icon: TrendingUp },
          { id: "taux" as Onglet,        label: "Taux",        icon: Settings },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setOnglet(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              onglet === id
                ? "border-[#1a4731] text-[#1a4731]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Onglet Membres ────────────────────────────────────────────────── */}
      {onglet === "membres" && (
        <>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Nom, téléphone, section, village…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1a4731] focus:border-[#1a4731]"
            />
          </div>

          {isLoading ? (
            <TableSkeleton />
          ) : filtres.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icone={Users}
                titre={search ? "Aucun résultat" : "Aucun délégué de localités"}
                description={
                  search
                    ? "Modifiez votre recherche."
                    : "Créez des membres avec la catégorie \"Délégué de localités\" depuis la page Membres."
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtres.map(m => {
                const solde = soldeAvances(m.id);
                const avancesM = avancesParMembre.get(m.id) ?? [];
                const enRetard = avancesM.some(a => a.statut === "en_retard");
                return (
                  <div
                    key={m.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => setModalMembre(m)}
                  >
                    <div className="w-10 h-10 rounded-full bg-[#1a4731]/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-[#1a4731]">
                        {(m.prenoms ?? m.nom).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{m.prenoms} {m.nom}</p>
                        {enRetard && <AlertCircle size={13} className="text-red-500 shrink-0" />}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone size={10} /> {m.telephone}
                        </span>
                        {(m.section || m.village) && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin size={10} /> {m.section ?? m.village}
                          </span>
                        )}
                      </div>
                      {solde > 0 && (
                        <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          enRetard ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                        }`}>
                          <Wallet size={10} />
                          {formaterMontant(solde)} d'avances
                        </div>
                      )}
                    </div>
                    <ChevronRight size={15} className="text-gray-300 shrink-0 mt-1" />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Onglet Commissions ────────────────────────────────────────────── */}
      {onglet === "commissions" && (
        <>
          {totalEnAttente > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <Clock size={18} className="text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {formaterMontant(totalEnAttente)} de commissions en attente
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Cliquez sur un délégué pour effectuer le paiement
                </p>
              </div>
            </div>
          )}

          {loadRecap ? (
            <TableSkeleton />
          ) : recapCommissions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icone={TrendingUp}
                titre="Aucune commission"
                description="Les commissions sont générées automatiquement à la clôture de chaque session de pesée pour les délégués de localités."
              />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Délégué</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">En attente</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total payé</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sessions</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recapCommissions.map(r => (
                    <tr key={r.membreId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.prenoms} {r.nom}</p>
                        {(r.section || r.village) && (
                          <p className="text-xs text-gray-400">{r.section ?? r.village}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.enAttenteFcfa > 0 ? (
                          <span className="font-semibold text-amber-700">{formaterMontant(r.enAttenteFcfa)}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{formaterMontant(r.totalPayeFcfa)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{r.nb}</td>
                      <td className="px-4 py-3 text-right">
                        {r.enAttenteFcfa > 0 && peutModifier && (
                          <button
                            onClick={() => ouvrirModalCommission(r)}
                            className="flex items-center gap-1 text-xs font-medium text-[#1a4731] hover:underline ml-auto"
                          >
                            <Banknote size={12} /> Payer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Onglet Taux ───────────────────────────────────────────────────── */}
      {onglet === "taux" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Taux de commission FCFA/kg appliqués aux délégués de localités lors de la pesée.
            </p>
            {peutModifier && !showTauxForm && (
              <button
                onClick={() => setShowTauxForm(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-[#1a4731] hover:underline"
              >
                <PlusCircle size={14} /> Nouveau taux
              </button>
            )}
          </div>

          {/* Formulaire nouveau taux */}
          {showTauxForm && (
            <div className="bg-white border border-[#1a4731]/20 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-[#1a4731]">Nouveau taux de commission</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Délégué spécifique (laisser vide pour taux global)</label>
                  <select
                    value={formTaux.membreDelegueId}
                    onChange={e => setFormTaux(f => ({ ...f, membreDelegueId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                  >
                    <option value="">— Tous les délégués (taux global) —</option>
                    {membres.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.prenoms} {m.nom}
                        {m.section ? ` (${m.section})` : m.village ? ` — ${m.village}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Taux (FCFA / kg) *</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formTaux.tauxFcfaParKg}
                    onChange={e => setFormTaux(f => ({ ...f, tauxFcfaParKg: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                    placeholder="Ex : 5"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Date de début *</label>
                  <input
                    type="date"
                    value={formTaux.dateDebut}
                    onChange={e => setFormTaux(f => ({ ...f, dateDebut: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Date de fin (optionnel)</label>
                  <input
                    type="date"
                    value={formTaux.dateFin}
                    onChange={e => setFormTaux(f => ({ ...f, dateFin: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                  />
                </div>
              </div>
              {errTaux && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {errTaux}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => mutAjouterTaux.mutate()}
                  disabled={!formTaux.tauxFcfaParKg || mutAjouterTaux.isPending}
                  className="bg-[#1a4731] text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {mutAjouterTaux.isPending ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button
                  onClick={() => { setShowTauxForm(false); setErrTaux(""); }}
                  className="px-4 text-sm text-gray-500 hover:text-gray-700"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {loadTaux ? (
            <TableSkeleton />
          ) : taux.length === 0 && !showTauxForm ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icone={Settings}
                titre="Aucun taux configuré"
                description="Configurez un taux FCFA/kg pour activer le calcul automatique des commissions à la pesée."
              />
            </div>
          ) : taux.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Délégué</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Taux</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Période</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {taux.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        {t.membreDelegueId ? (
                          <span className="font-medium text-gray-900">
                            {t.membrePrenoms} {t.membreNom}
                          </span>
                        ) : (
                          <span className="italic text-gray-500">Taux global (tous)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#1a4731]">
                        {t.tauxFcfaParKg} F/kg
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        À partir du {formaterDate(t.dateDebut)}
                        {t.dateFin && ` → ${formaterDate(t.dateFin)}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          t.actif ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {t.actif ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {peutModifier && (
                          <button
                            onClick={() => mutSupprimerTaux.mutate(t.id)}
                            className="text-red-400 hover:text-red-600 p-1 rounded"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      {/* ── Modal membre (avances) ────────────────────────────────────────── */}
      {modalMembre && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <p className="font-bold text-gray-900">{modalMembre.prenoms} {modalMembre.nom}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {modalMembre.telephone}
                  {modalMembre.section && ` · ${modalMembre.section}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setLocation(`/membres/${modalMembre.id}`); }}
                  className="text-xs text-[#1a4731] font-medium hover:underline"
                >
                  Fiche complète
                </button>
                <button
                  onClick={() => { setModalMembre(null); setShowOctroi(false); setErrOctroi(""); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Avances</p>
                {peutOctroyer && !showOctroi && (
                  <button
                    onClick={() => setShowOctroi(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#1a4731] hover:underline"
                  >
                    <PlusCircle size={13} /> Octroyer
                  </button>
                )}
              </div>

              {showOctroi && (
                <div className="border border-[#1a4731]/20 rounded-xl p-4 space-y-3 bg-green-50/30">
                  <p className="text-xs font-semibold text-[#1a4731]">Nouvelle avance</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Montant (FCFA) *</label>
                      <input
                        type="number"
                        value={formOctroi.montant}
                        onChange={e => setFormOctroi(f => ({ ...f, montant: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                        placeholder="50 000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Date d'octroi *</label>
                      <input
                        type="date"
                        value={formOctroi.dateOctroi}
                        onChange={e => setFormOctroi(f => ({ ...f, dateOctroi: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Échéance</label>
                    <input
                      type="date"
                      value={formOctroi.dateEcheance}
                      onChange={e => setFormOctroi(f => ({ ...f, dateEcheance: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Motif</label>
                    <input
                      type="text"
                      value={formOctroi.motif}
                      onChange={e => setFormOctroi(f => ({ ...f, motif: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                      placeholder="Achat d'intrants, frais de déplacement…"
                    />
                  </div>
                  {errOctroi && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={12} /> {errOctroi}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => mutOctroyer.mutate()}
                      disabled={!formOctroi.montant || mutOctroyer.isPending}
                      className="flex-1 bg-[#1a4731] text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50"
                    >
                      {mutOctroyer.isPending ? "Enregistrement…" : "Confirmer"}
                    </button>
                    <button
                      onClick={() => { setShowOctroi(false); setErrOctroi(""); }}
                      className="px-4 text-sm text-gray-500 hover:text-gray-700"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {loadAvances ? (
                <div className="text-sm text-center text-gray-400 py-4">Chargement…</div>
              ) : avancesModal.length === 0 ? (
                <div className="text-sm text-center text-gray-400 py-6">Aucune avance enregistrée</div>
              ) : (
                <div className="space-y-2">
                  {avancesModal.map(a => {
                    const enCours = a.statut !== "rembourse";
                    return (
                      <div
                        key={a.id}
                        className={`rounded-xl border p-3 ${
                          a.statut === "en_retard"
                            ? "border-red-200 bg-red-50"
                            : a.statut === "rembourse"
                            ? "border-gray-100 bg-gray-50"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{formaterMontant(a.montantOctroyeFcfa)}</p>
                            {a.motif && <p className="text-xs text-gray-500 mt-0.5">{a.motif}</p>}
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <CalendarDays size={10} /> {formaterDate(a.dateOctroi)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            {enCours && (
                              <p className="text-xs font-semibold text-gray-700">
                                Solde : {formaterMontant(a.soldeRestantFcfa)}
                              </p>
                            )}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              a.statut === "en_retard"
                                ? "bg-red-100 text-red-600"
                                : a.statut === "rembourse"
                                ? "bg-gray-100 text-gray-500"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {a.statut === "en_cours" ? "En cours" : a.statut === "rembourse" ? "Remboursé" : "En retard"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal paiement commissions ────────────────────────────────────── */}
      {modalCommission && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <p className="font-bold text-gray-900">
                  {modalCommission.prenoms} {modalCommission.nom}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Paiement des commissions en attente</p>
              </div>
              <button
                onClick={() => { setModalCommission(null); setDetailCommissions([]); setErrPayer(""); }}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Résumé avec avances */}
              {(() => {
                const totalBrut = detailCommissions.reduce((s, c) => s + c.montantFcfa, 0);
                const totalAvances = avancesModalComm.reduce((s, a) => s + a.soldeRestantFcfa, 0);
                const retenue = Math.min(totalAvances, totalBrut);
                const montantNet = Math.max(0, totalBrut - retenue);
                return (
                  <div className="bg-[#1a4731]/5 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Commissions brutes</span>
                      <span className="font-medium text-gray-800">{formaterMontant(modalCommission.enAttenteFcfa)}</span>
                    </div>
                    {retenue > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-amber-600 flex items-center gap-1">
                          <AlertCircle size={12} /> Retenue avances
                        </span>
                        <span className="font-medium text-amber-700">− {formaterMontant(retenue)}</span>
                      </div>
                    )}
                    <div className="border-t border-[#1a4731]/20 pt-2 flex justify-between items-center">
                      <span className="text-xs text-gray-500 font-medium">Net à décaisser</span>
                      <span className="text-2xl font-bold text-[#1a4731]">{formaterMontant(montantNet)}</span>
                    </div>
                    <p className="text-xs text-gray-400">{detailCommissions.length} session(s) de pesée</p>
                  </div>
                );
              })()}

              {/* Détail des commissions */}
              {detailCommissions.length > 0 && (
                <div className="space-y-1.5">
                  {detailCommissions.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-xs text-gray-600 py-1 border-b border-gray-50">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={11} className="text-gray-300" />
                        {formaterDate(c.createdAt)} — {c.poidsKg} kg × {c.tauxFcfaParKg} F/kg
                      </span>
                      <span className="font-medium">{formaterMontant(c.montantFcfa)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Mode de paiement */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Mode de paiement *</label>
                  <select
                    value={formPayer.modePaiement}
                    onChange={e => setFormPayer(f => ({ ...f, modePaiement: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                  >
                    <option value="especes">Espèces</option>
                    <option value="orange_money">Orange Money</option>
                    <option value="mtn_momo">MTN MoMo</option>
                    <option value="wave">Wave</option>
                    <option value="virement">Virement</option>
                    <option value="cheque">Chèque</option>
                  </select>
                </div>
                {formPayer.modePaiement !== "especes" && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Référence / Numéro</label>
                    <input
                      type="text"
                      value={formPayer.referencePaiement}
                      onChange={e => setFormPayer(f => ({ ...f, referencePaiement: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                      placeholder="Numéro de transaction"
                    />
                  </div>
                )}
              </div>

              {errPayer && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {errPayer}
                </p>
              )}

              {(() => {
                const totalBrut   = detailCommissions.reduce((s, c) => s + c.montantFcfa, 0);
                const totalAvances = avancesModalComm.reduce((s, a) => s + a.soldeRestantFcfa, 0);
                const retenue     = Math.min(totalAvances, totalBrut);
                const montantNet  = Math.max(0, totalBrut - retenue);
                return (
                  <button
                    onClick={() => mutPayer.mutate()}
                    disabled={mutPayer.isPending}
                    className="w-full bg-[#1a4731] text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
                  >
                    {mutPayer.isPending
                      ? "Paiement en cours…"
                      : `Confirmer le paiement — ${formaterMontant(montantNet)}`}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

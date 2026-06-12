import { useState } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Users, FileText, BarChart2, CreditCard,
  Plus, RefreshCw, CheckCircle, Banknote,
  Loader2, ChevronDown, TrendingUp, Building2,
  UserCheck, AlertCircle, FileDown,
} from "lucide-react";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  useGetPersonnel,
  useCreatePersonnel,
  useUpdatePersonnel,
  useArchiverPersonnel,
  useGenererBulletins,
  useGetBulletins,
  useValiderBulletin,
  usePayerBulletin,
  useDeleteBulletin,
  useGetAvancesPersonnel,
  useCreateAvancePersonnel,
  useRembourserAvancePersonnel,
  useGetRapportMensuel,
  useGetHistoriqueMasse,
  Personnel,
  BulletinAvecPersonnel,
  AvanceAvecPersonnel,
  CreatePersonnelInput,
  UpdatePersonnelInput,
} from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function downloadPdfBulletin(bulletinId: number) {
  const token = localStorage.getItem("coop_token") ?? "";
  const res = await fetch(`${BASE}/api/rapports/recu/bulletin/${bulletinId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return;
  const blob = await res.blob();
  if (blob.size === 0) return;
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `bulletin_paie_${bulletinId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 200);
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MOIS_NOMS = [
  "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const CONTRAT_LABELS: Record<string, string> = {
  cdi: "CDI", cdd: "CDD", journalier: "Journalier", stagiaire: "Stagiaire",
};

const STATUT_COLORS_BULLETIN: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-600",
  valide: "bg-blue-100 text-blue-700",
  paye: "bg-green-100 text-green-700",
};

const STATUT_LABELS_BULLETIN: Record<string, string> = {
  brouillon: "Brouillon", valide: "Validé", paye: "Payé",
};

const PIE_COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const INPUT_CLS =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";

function formatFcfa(n: number): string {
  return new Intl.NumberFormat("fr-CI").format(n) + " FCFA";
}

function formatFcfaShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + " K";
  return String(n);
}

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  return d instanceof Date ? d : new Date(d);
}

// ─── Onglets ─────────────────────────────────────────────────────────────────

type Tab = "personnel" | "paie" | "masse" | "avances";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "personnel", label: "Personnel", icon: Users },
  { id: "paie", label: "Génération de la paie", icon: FileText },
  { id: "masse", label: "Masse salariale", icon: BarChart2 },
  { id: "avances", label: "Avances personnel", icon: CreditCard },
];

// ══════════════════════════════════════════════════════════════════════════════
//  Page principale
// ══════════════════════════════════════════════════════════════════════════════

export default function SalairesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("personnel");
  const canLire = usePermission("salaires", "lire");

  if (!canLire) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Accès refusé
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 rounded-lg">
          <Banknote className="h-6 w-6 text-green-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salaires & Paie</h1>
          <p className="text-sm text-gray-500">
            Gestion du personnel, bulletins de paie et masse salariale
          </p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${active
                    ? "border-green-600 text-green-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "personnel" && <TabPersonnel />}
      {activeTab === "paie" && <TabPaie />}
      {activeTab === "masse" && <TabMasse />}
      {activeTab === "avances" && <TabAvances />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  ONGLET 1 — Personnel
// ══════════════════════════════════════════════════════════════════════════════

function TabPersonnel() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editPersonnel, setEditPersonnel] = useState<Personnel | null>(null);
  const [search, setSearch] = useState("");

  const canCreer = usePermission("salaires", "creer_personnel");
  const canModifier = usePermission("salaires", "modifier_personnel");
  const canSupprimer = usePermission("salaires", "supprimer_personnel");

  const { data: personnel, refetch, isLoading } = useGetPersonnel();
  const archiver = useArchiverPersonnel();

  const list: Personnel[] = personnel ?? [];
  const filtered = list.filter((p: Personnel) =>
    [p.nom, p.prenoms, p.poste].join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  const actifs = filtered.filter((p: Personnel) => p.statut === "actif");
  const inactifs = filtered.filter((p: Personnel) => p.statut !== "actif");

  async function handleArchiver(id: number, nom: string) {
    if (!confirm(`Archiver ${nom} ? Cette action est irréversible.`)) return;
    try {
      await archiver.mutateAsync({ id });
      toast({ title: "Personnel archivé" });
      refetch();
    } catch {
      toast({ title: "Erreur lors de l'archivage", variant: "destructive" });
    }
  }

  const initiales = (p: Personnel) =>
    (p.nom[0] ?? "") + (p.prenoms[0] ?? "");

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <input
          className={INPUT_CLS + " sm:w-72"}
          placeholder="Rechercher par nom, prénom, poste…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </button>
          {canCreer && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            >
              <Plus className="h-4 w-4" /> Ajouter un employé
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Personnel actif", value: list.filter((p: Personnel) => p.statut === "actif").length, color: "text-green-700" },
          { label: "CDI", value: list.filter((p: Personnel) => p.typeContrat === "cdi" && p.statut === "actif").length, color: "text-blue-700" },
          { label: "CDD", value: list.filter((p: Personnel) => p.typeContrat === "cdd" && p.statut === "actif").length, color: "text-amber-700" },
          {
            label: "Masse de base",
            value: formatFcfaShort(list.filter((p: Personnel) => p.statut === "actif").reduce((s: number, p: Personnel) => s + p.salaireBaseFcfa, 0)),
            color: "text-purple-700",
          },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-green-600" />
        </div>
      ) : (
        <>
          <PersonnelTable
            title="Actifs"
            rows={actifs}
            canModifier={canModifier}
            canSupprimer={canSupprimer}
            onEdit={setEditPersonnel}
            onArchiver={handleArchiver}
            initiales={initiales}
          />
          {inactifs.length > 0 && (
            <PersonnelTable
              title="Archivés"
              rows={inactifs}
              canModifier={false}
              canSupprimer={false}
              onEdit={() => {}}
              onArchiver={() => {}}
              initiales={initiales}
              collapsed
            />
          )}
        </>
      )}

      {(showCreate || editPersonnel) && (
        <PersonnelModal
          personnel={editPersonnel}
          onClose={() => { setShowCreate(false); setEditPersonnel(null); }}
          onSaved={() => { setShowCreate(false); setEditPersonnel(null); refetch(); }}
        />
      )}
    </div>
  );
}

// ─── Sous-composant tableau personnel ────────────────────────────────────────

function PersonnelTable({
  title, rows, canModifier, canSupprimer, onEdit, onArchiver, initiales, collapsed = false,
}: {
  title: string;
  rows: Personnel[];
  canModifier: boolean;
  canSupprimer: boolean;
  onEdit: (p: Personnel) => void;
  onArchiver: (id: number, nom: string) => void;
  initiales: (p: Personnel) => string;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-semibold text-gray-700">
          {title} — {rows.length} personne{rows.length !== 1 ? "s" : ""}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Nom</th>
                <th className="px-4 py-3 text-left">Poste</th>
                <th className="px-4 py-3 text-left">Contrat</th>
                <th className="px-4 py-3 text-right">Salaire base</th>
                <th className="px-4 py-3 text-center">Statut</th>
                {(canModifier || canSupprimer) && (
                  <th className="px-4 py-3 text-center">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400 text-sm">
                    Aucun résultat
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold uppercase">
                          {initiales(p)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {p.prenoms} {p.nom}
                          </p>
                          {p.telephonePaiement && (
                            <p className="text-xs text-gray-400">{p.telephonePaiement}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.poste}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                        {CONTRAT_LABELS[p.typeContrat] ?? p.typeContrat}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatFcfa(p.salaireBaseFcfa)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.statut === "actif"
                          ? "bg-green-100 text-green-700"
                          : p.statut === "suspendu"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {p.statut}
                      </span>
                    </td>
                    {(canModifier || canSupprimer) && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {canModifier && (
                            <button
                              onClick={() => onEdit(p)}
                              className="text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                              Modifier
                            </button>
                          )}
                          {canSupprimer && p.statut === "actif" && (
                            <button
                              onClick={() => onArchiver(p.id, `${p.prenoms} ${p.nom}`)}
                              className="text-xs text-red-500 hover:text-red-700 underline"
                            >
                              Archiver
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  ONGLET 2 — Génération de la paie
// ══════════════════════════════════════════════════════════════════════════════

function TabPaie() {
  const { toast } = useToast();
  const now = new Date();
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [showPayer, setShowPayer] = useState<BulletinAvecPersonnel | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloadingBulletins, setDownloadingBulletins] = useState<Set<number>>(new Set());

  async function handleDownloadBulletin(id: number) {
    if (downloadingBulletins.has(id)) return;
    setDownloadingBulletins((prev) => new Set(prev).add(id));
    try {
      await downloadPdfBulletin(id);
    } finally {
      setDownloadingBulletins((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  const canGenerer = usePermission("salaires", "generer_bulletins");
  const canValider = usePermission("salaires", "valider_bulletins");
  const canPayer = usePermission("salaires", "payer_bulletins");
  const canSupprimer = usePermission("salaires", "supprimer_bulletin");

  const { data: bulletins, refetch, isLoading } = useGetBulletins(
    { mois, annee },
    { query: { queryKey: ["bulletins", mois, annee] } },
  );
  const generer = useGenererBulletins();
  const valider = useValiderBulletin();
  const payer = usePayerBulletin();
  const supprimer = useDeleteBulletin();

  async function handleGenerer() {
    if (!confirm(`Générer les bulletins de paie pour ${MOIS_NOMS[mois]} ${annee} ?`)) return;
    setGenerating(true);
    try {
      const res = await generer.mutateAsync({ data: { mois, annee } });
      const count = Array.isArray(res) ? res.length : 0;
      toast({ title: `${count} bulletin(s) généré(s)` });
      refetch();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erreur?: string } } })?.response?.data?.erreur ?? "Erreur";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleValider(id: number) {
    try {
      await valider.mutateAsync({ id });
      toast({ title: "Bulletin validé" });
      refetch();
    } catch {
      toast({ title: "Erreur lors de la validation", variant: "destructive" });
    }
  }

  async function handlePayer(id: number, reference: string) {
    try {
      await payer.mutateAsync({ id, data: { referencePaiement: reference || undefined } });
      toast({ title: "Bulletin marqué payé" });
      setShowPayer(null);
      refetch();
    } catch {
      toast({ title: "Erreur lors du paiement", variant: "destructive" });
    }
  }

  async function handleSupprimer(id: number) {
    if (!confirm("Supprimer ce bulletin brouillon ?")) return;
    try {
      await supprimer.mutateAsync({ id });
      toast({ title: "Bulletin supprimé" });
      refetch();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  }

  async function handleValiderTous() {
    const brouillons = (bulletins ?? [] as BulletinAvecPersonnel[]).filter((b: BulletinAvecPersonnel) => b.bulletin.statut === "brouillon");
    if (brouillons.length === 0) return;
    if (!confirm(`Valider les ${brouillons.length} bulletins en brouillon ?`)) return;
    for (const b of brouillons) {
      try { await valider.mutateAsync({ id: b.bulletin.id }); } catch { /* skip */ }
    }
    toast({ title: `${brouillons.length} bulletin(s) validé(s)` });
    refetch();
  }

  const list: BulletinAvecPersonnel[] = bulletins ?? [];
  const nbBrouillons = list.filter((b: BulletinAvecPersonnel) => b.bulletin.statut === "brouillon").length;
  const nbValides = list.filter((b: BulletinAvecPersonnel) => b.bulletin.statut === "valide").length;
  const nbPayes = list.filter((b: BulletinAvecPersonnel) => b.bulletin.statut === "paye").length;
  const totalNet = list.reduce((s: number, b: BulletinAvecPersonnel) => s + b.bulletin.salaireNetFcfa, 0);

  return (
    <div className="space-y-4">
      {/* Sélecteur période */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mois</label>
            <select
              value={mois}
              onChange={(e) => setMois(Number(e.target.value))}
              className={INPUT_CLS + " w-auto"}
            >
              {MOIS_NOMS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Année</label>
            <select
              value={annee}
              onChange={(e) => setAnnee(Number(e.target.value))}
              className={INPUT_CLS + " w-auto"}
            >
              {[2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canGenerer && (
              <button
                onClick={handleGenerer}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm disabled:opacity-60"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Générer la paie du mois
              </button>
            )}
            {canValider && nbBrouillons > 0 && (
              <button
                onClick={handleValiderTous}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                <CheckCircle className="h-4 w-4" />
                Valider tous ({nbBrouillons})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Brouillons", value: nbBrouillons, color: "text-gray-600" },
          { label: "Validés", value: nbValides, color: "text-blue-700" },
          { label: "Payés", value: nbPayes, color: "text-green-700" },
          { label: "Total net", value: formatFcfaShort(totalNet), color: "text-purple-700" },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tableau bulletins */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-green-600" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            <FileText className="h-8 w-8 mx-auto mb-3 text-gray-200" />
            Aucun bulletin pour cette période.
            {canGenerer && (
              <p className="mt-1">Cliquez sur « Générer la paie du mois » pour démarrer.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Employé</th>
                  <th className="px-4 py-3 text-right">Brut</th>
                  <th className="px-4 py-3 text-right">Retenues</th>
                  <th className="px-4 py-3 text-right font-bold">Net</th>
                  <th className="px-4 py-3 text-center">Statut</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {list.map(({ bulletin, personnel }: BulletinAvecPersonnel) => (
                  <tr key={bulletin.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {personnel.prenoms} {personnel.nom}
                      </p>
                      <p className="text-xs text-gray-400">{personnel.poste}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatFcfa(bulletin.salaireBrutFcfa)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      − {formatFcfa(bulletin.totalRetenuesFcfa)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-700 text-base">
                      {formatFcfa(bulletin.salaireNetFcfa)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS_BULLETIN[bulletin.statut] ?? ""}`}>
                        {STATUT_LABELS_BULLETIN[bulletin.statut] ?? bulletin.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {canValider && bulletin.statut === "brouillon" && (
                          <button
                            onClick={() => handleValider(bulletin.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            Valider
                          </button>
                        )}
                        {canPayer && bulletin.statut === "valide" && (
                          <button
                            onClick={() => setShowPayer({ bulletin, personnel })}
                            className="text-xs text-green-600 hover:text-green-800 underline"
                          >
                            Payer
                          </button>
                        )}
                        {canSupprimer && bulletin.statut === "brouillon" && (
                          <button
                            onClick={() => handleSupprimer(bulletin.id)}
                            className="text-xs text-red-500 hover:text-red-700 underline"
                          >
                            Supprimer
                          </button>
                        )}
                        {bulletin.statut === "paye" && (
                          <span className="text-xs text-gray-400">
                            {toDate(bulletin.datePaiement)?.toLocaleDateString("fr-CI") ?? "—"}
                          </span>
                        )}
                        <button
                          title="Télécharger le bulletin PDF"
                          onClick={() => void handleDownloadBulletin(bulletin.id)}
                          disabled={downloadingBulletins.has(bulletin.id)}
                          className="p-1 text-gray-400 hover:text-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {downloadingBulletins.has(bulletin.id)
                            ? <Loader2 size={14} className="animate-spin text-green-600" />
                            : <FileDown size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-green-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-700">Total</td>
                  <td className="px-4 py-3 text-right text-sm">
                    {formatFcfa(list.reduce((s: number, b: BulletinAvecPersonnel) => s + b.bulletin.salaireBrutFcfa, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-red-600">
                    − {formatFcfa(list.reduce((s: number, b: BulletinAvecPersonnel) => s + b.bulletin.totalRetenuesFcfa, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-green-700">
                    {formatFcfa(totalNet)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {showPayer && (
        <PayerModal
          bulletin={showPayer}
          onClose={() => setShowPayer(null)}
          onPayer={handlePayer}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  ONGLET 3 — Masse salariale
// ══════════════════════════════════════════════════════════════════════════════

function TabMasse() {
  const now = new Date();
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());

  const { data: rapport, isLoading } = useGetRapportMensuel(mois, annee, {
    query: { queryKey: ["rapport", mois, annee] },
  });
  const { data: historique } = useGetHistoriqueMasse();

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mois</label>
            <select
              value={mois}
              onChange={(e) => setMois(Number(e.target.value))}
              className={INPUT_CLS + " w-auto"}
            >
              {MOIS_NOMS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Année</label>
            <select
              value={annee}
              onChange={(e) => setAnnee(Number(e.target.value))}
              className={INPUT_CLS + " w-auto"}
            >
              {[2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-green-600" />
        </div>
      ) : rapport ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Masse salariale brute", value: formatFcfa(rapport.totalBrut), Icon: TrendingUp, cls: "bg-blue-50 text-blue-700 border-blue-100" },
              { label: "Masse salariale nette", value: formatFcfa(rapport.totalNet), Icon: Banknote, cls: "bg-green-50 text-green-700 border-green-100" },
              { label: "Charges patronales", value: formatFcfa(rapport.totalChargesPatronales), Icon: Building2, cls: "bg-amber-50 text-amber-700 border-amber-100" },
              { label: "Coût total employeur", value: formatFcfa(rapport.coutTotalEmployeur), Icon: UserCheck, cls: "bg-purple-50 text-purple-700 border-purple-100" },
            ].map(({ label, value, Icon, cls }) => (
              <div key={label} className={`bg-white rounded-xl border p-4 shadow-sm ${cls}`}>
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs font-medium opacity-80">{label}</p>
                  <Icon className="h-4 w-4 opacity-60" />
                </div>
                <p className="text-lg font-bold">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Personnel actif", value: rapport.nbPersonnelActifs },
              { label: "Bulletins générés", value: rapport.nbBulletins },
              { label: "Bulletins validés", value: rapport.nbValides },
              { label: "Bulletins payés", value: rapport.nbPayes },
            ].map((k) => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm text-center">
                <p className="text-2xl font-bold text-gray-900">{k.value}</p>
                <p className="text-xs text-gray-500 mt-1">{k.label}</p>
              </div>
            ))}
          </div>

          {rapport.detailsParPoste.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Répartition par poste</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={rapport.detailsParPoste}
                      dataKey="totalNet"
                      nameKey="poste"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ poste, percent }: { poste: string; percent: number }) =>
                        `${poste} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {rapport.detailsParPoste.map((_: unknown, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [formatFcfa(v), "Net"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Détail par poste</h3>
                <div className="space-y-2">
                  {rapport.detailsParPoste.map((d: { poste: string; nbPersonnel: number; totalNet: number }, i: number) => (
                    <div key={d.poste} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="text-gray-700">{d.poste}</span>
                        <span className="text-gray-400 text-xs">({d.nbPersonnel})</span>
                      </div>
                      <span className="font-medium text-gray-900">{formatFcfa(d.totalNet)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm text-center py-12 text-gray-400 text-sm">
          Aucune donnée pour cette période. Générez d'abord les bulletins.
        </div>
      )}

      {(historique ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Évolution de la masse salariale (12 mois)
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={historique} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="periode"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickFormatter={(v: number) => formatFcfaShort(v)}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  formatFcfa(v),
                  name === "totalNet" ? "Net" : name === "totalBrut" ? "Brut" : "Coût employeur",
                ]}
                labelStyle={{ fontWeight: 600, color: "#111827" }}
              />
              <Legend
                formatter={(value: string) =>
                  value === "totalNet" ? "Net" : value === "totalBrut" ? "Brut" : "Coût employeur"
                }
              />
              <Bar dataKey="totalBrut" fill="#bfdbfe" name="totalBrut" radius={[3, 3, 0, 0]} />
              <Bar dataKey="totalNet" fill="#16a34a" name="totalNet" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  ONGLET 4 — Avances personnel
// ══════════════════════════════════════════════════════════════════════════════

function TabAvances() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const canGerer = usePermission("salaires", "gerer_avances");

  const { data: avances, refetch, isLoading } = useGetAvancesPersonnel({ statut: "en_cours" });
  const rembourser = useRembourserAvancePersonnel();

  async function handleRembourser(id: number) {
    if (!confirm("Marquer cette avance comme entièrement remboursée ?")) return;
    try {
      await rembourser.mutateAsync({ id, data: {} });
      toast({ title: "Avance remboursée" });
      refetch();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  }

  const list: AvanceAvecPersonnel[] = avances ?? [];
  const totalEncours = list.reduce(
    (s: number, a: AvanceAvecPersonnel) => s + (a.avance.montantFcfa - a.avance.montantRembourse),
    0,
  );
  const now = Date.now();
  const deuxMoisMs = 2 * 30 * 24 * 3600 * 1000;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Avances en cours</p>
          <p className="text-2xl font-bold text-amber-600">{list.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Montant total encours</p>
          <p className="text-xl font-bold text-red-600">{formatFcfa(totalEncours)}</p>
        </div>
        {canGerer && (
          <div className="flex items-center sm:justify-start">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            >
              <Plus className="h-4 w-4" /> Nouvelle avance
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-green-600" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            <CreditCard className="h-8 w-8 mx-auto mb-3 text-gray-200" />
            Aucune avance en cours
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Employé</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  <th className="px-4 py-3 text-right">Remboursé</th>
                  <th className="px-4 py-3 text-right">Restant</th>
                  <th className="px-4 py-3 text-left">Date octroi</th>
                  <th className="px-4 py-3 text-left">Motif</th>
                  {canGerer && <th className="px-4 py-3 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {list.map(({ avance, personnel }: AvanceAvecPersonnel) => {
                  const restant = avance.montantFcfa - avance.montantRembourse;
                  const octroiDate = toDate(avance.createdAt);
                  const isOld = octroiDate ? (now - octroiDate.getTime() > deuxMoisMs) : false;
                  return (
                    <tr key={avance.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isOld && (
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" aria-label="Avance > 2 mois" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">
                              {personnel.prenoms} {personnel.nom}
                            </p>
                            <p className="text-xs text-gray-400">{personnel.poste}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatFcfa(avance.montantFcfa)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {formatFcfa(avance.montantRembourse)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">
                        {formatFcfa(restant)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {toDate(avance.dateOctroi)?.toLocaleDateString("fr-CI") ?? avance.dateOctroi}
                        {isOld && (
                          <span className="ml-1 text-xs bg-red-100 text-red-600 px-1 rounded">
                            &gt; 2 mois
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {avance.motif ?? "—"}
                      </td>
                      {canGerer && (
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleRembourser(avance.id)}
                            className="text-xs text-green-600 hover:text-green-800 underline"
                          >
                            Rembourser
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <AvanceModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refetch(); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODALES
// ══════════════════════════════════════════════════════════════════════════════

function PersonnelModal({
  personnel,
  onClose,
  onSaved,
}: {
  personnel: Personnel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const create = useCreatePersonnel();
  const update = useUpdatePersonnel();

  const [form, setForm] = useState({
    nom: personnel?.nom ?? "",
    prenoms: personnel?.prenoms ?? "",
    poste: personnel?.poste ?? "",
    typeContrat: (personnel?.typeContrat ?? "cdi") as CreatePersonnelInput["typeContrat"],
    dateEmbauche: personnel?.dateEmbauche ?? "",
    salaireBaseFcfa: personnel?.salaireBaseFcfa ?? 0,
    sursalaireFcfa: personnel?.sursalaireFcfa ?? 0,
    numeroCnps: personnel?.numeroCnps ?? "",
    numeroCni: personnel?.numeroCni ?? "",
    modePaiement: (personnel?.modePaiement ?? "especes") as CreatePersonnelInput["modePaiement"],
    telephonePaiement: personnel?.telephonePaiement ?? "",
    ribBanque: personnel?.ribBanque ?? "",
  });

  function f<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      nom: form.nom,
      prenoms: form.prenoms,
      poste: form.poste,
      typeContrat: form.typeContrat,
      dateEmbauche: form.dateEmbauche,
      salaireBaseFcfa: Number(form.salaireBaseFcfa),
      sursalaireFcfa: Number(form.sursalaireFcfa) || undefined,
      numeroCnps: form.numeroCnps || undefined,
      numeroCni: form.numeroCni || undefined,
      modePaiement: form.modePaiement,
      telephonePaiement: form.telephonePaiement || undefined,
      ribBanque: form.ribBanque || undefined,
    };
    try {
      if (personnel) {
        await update.mutateAsync({ id: personnel.id, data: payload as UpdatePersonnelInput });
        toast({ title: "Personnel mis à jour" });
      } else {
        await create.mutateAsync({ data: payload as CreatePersonnelInput });
        toast({ title: "Personnel créé" });
      }
      onSaved();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erreur?: string } } })?.response?.data?.erreur ?? "Erreur";
      toast({ title: msg, variant: "destructive" });
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {personnel ? "Modifier le personnel" : "Ajouter un employé"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Prénom(s)" required>
              <input
                className={INPUT_CLS}
                value={form.prenoms}
                onChange={(e) => f("prenoms", e.target.value)}
                required
              />
            </Field>
            <Field label="Nom" required>
              <input
                className={INPUT_CLS}
                value={form.nom}
                onChange={(e) => f("nom", e.target.value)}
                required
              />
            </Field>
            <Field label="Poste" required>
              <input
                className={INPUT_CLS}
                value={form.poste}
                onChange={(e) => f("poste", e.target.value)}
                required
              />
            </Field>
            <Field label="Type de contrat">
              <select
                className={INPUT_CLS}
                value={form.typeContrat}
                onChange={(e) => f("typeContrat", e.target.value as CreatePersonnelInput["typeContrat"])}
              >
                <option value="cdi">CDI</option>
                <option value="cdd">CDD</option>
                <option value="journalier">Journalier</option>
                <option value="stagiaire">Stagiaire</option>
              </select>
            </Field>
            <Field label="Date d'embauche" required>
              <input
                type="date"
                className={INPUT_CLS}
                value={form.dateEmbauche}
                onChange={(e) => f("dateEmbauche", e.target.value)}
                required
              />
            </Field>
            <Field label="Salaire de base (FCFA)" required>
              <MoneyInput
                className={INPUT_CLS}
                value={String(form.salaireBaseFcfa)}
                onChange={(raw) => f("salaireBaseFcfa", raw ? parseInt(raw) : 0)}
                required
              />
            </Field>
            <Field label="Sursalaire (FCFA)">
              <MoneyInput
                className={INPUT_CLS}
                value={String(form.sursalaireFcfa)}
                onChange={(raw) => f("sursalaireFcfa", raw ? parseInt(raw) : 0)}
              />
            </Field>
            <Field label="Mode de paiement">
              <select
                className={INPUT_CLS}
                value={form.modePaiement}
                onChange={(e) => f("modePaiement", e.target.value as CreatePersonnelInput["modePaiement"])}
              >
                <option value="especes">Espèces</option>
                <option value="orange_money">Orange Money</option>
                <option value="mtn_momo">MTN MoMo</option>
                <option value="virement">Virement bancaire</option>
              </select>
            </Field>
            {(form.modePaiement === "orange_money" || form.modePaiement === "mtn_momo") && (
              <Field label="Téléphone de paiement">
                <input
                  className={INPUT_CLS}
                  value={form.telephonePaiement}
                  onChange={(e) => f("telephonePaiement", e.target.value)}
                  placeholder="07 XX XX XX XX"
                />
              </Field>
            )}
            {form.modePaiement === "virement" && (
              <Field label="RIB Bancaire">
                <input
                  className={INPUT_CLS}
                  value={form.ribBanque}
                  onChange={(e) => f("ribBanque", e.target.value)}
                  placeholder="CI XX XXXX…"
                />
              </Field>
            )}
            <Field label="N° CNPS">
              <input
                className={INPUT_CLS}
                value={form.numeroCnps}
                onChange={(e) => f("numeroCnps", e.target.value)}
              />
            </Field>
            <Field label="N° CNI">
              <input
                className={INPUT_CLS}
                value={form.numeroCni}
                onChange={(e) => f("numeroCni", e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-60 flex items-center gap-2"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {personnel ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PayerModal({
  bulletin,
  onClose,
  onPayer,
}: {
  bulletin: BulletinAvecPersonnel;
  onClose: () => void;
  onPayer: (id: number, reference: string) => Promise<void>;
}) {
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onPayer(bulletin.bulletin.id, reference);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Confirmer le paiement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-sm text-gray-600 mb-1">
              {bulletin.personnel.prenoms} {bulletin.personnel.nom}
            </p>
            <p className="text-2xl font-bold text-green-700">
              {formatFcfa(bulletin.bulletin.salaireNetFcfa)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{bulletin.bulletin.periode}</p>
          </div>
          <Field label="Référence de paiement (optionnel)">
            <input
              className={INPUT_CLS}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="N° transaction, référence virement…"
            />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-60 flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmer le paiement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AvanceModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data: personnel } = useGetPersonnel();
  const create = useCreateAvancePersonnel();

  const [form, setForm] = useState({
    personnelId: "",
    montantFcfa: "",
    dateOctroi: new Date().toISOString().slice(0, 10),
    motif: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.personnelId || !form.montantFcfa) {
      toast({ title: "Renseignez tous les champs obligatoires", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({
        data: {
          personnelId: Number(form.personnelId),
          montantFcfa: Number(form.montantFcfa),
          dateOctroi: form.dateOctroi,
          motif: form.motif || undefined,
        },
      });
      toast({ title: "Avance enregistrée" });
      onSaved();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erreur?: string } } })?.response?.data?.erreur ?? "Erreur";
      toast({ title: msg, variant: "destructive" });
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Nouvelle avance personnel</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Employé" required>
            <select
              className={INPUT_CLS}
              value={form.personnelId}
              onChange={(e) => setForm((f) => ({ ...f, personnelId: e.target.value }))}
              required
            >
              <option value="">-- Sélectionner --</option>
              {(personnel ?? []).filter((p: Personnel) => p.statut === "actif").map((p: Personnel) => (
                <option key={p.id} value={p.id}>
                  {p.prenoms} {p.nom} — {p.poste}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Montant (FCFA)" required>
            <MoneyInput
              className={INPUT_CLS}
              value={form.montantFcfa}
              onChange={(raw) => setForm((f) => ({ ...f, montantFcfa: raw }))}
              required
            />
          </Field>
          <Field label="Date d'octroi" required>
            <input
              type="date"
              className={INPUT_CLS}
              value={form.dateOctroi}
              onChange={(e) => setForm((f) => ({ ...f, dateOctroi: e.target.value }))}
              required
            />
          </Field>
          <Field label="Motif">
            <input
              className={INPUT_CLS}
              value={form.motif}
              onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))}
              placeholder="Raison de l'avance…"
            />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-60 flex items-center gap-2"
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Composant utilitaire ────────────────────────────────────────────────────

function Field({
  label, required, children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

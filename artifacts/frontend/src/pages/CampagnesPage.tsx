import { useState, useEffect } from "react";
import { openPdfViewer } from "@/lib/pdfViewer";
import {
  CalendarDays, Plus, CheckCircle2, Clock, Loader2, AlertTriangle,
  XCircle, BarChart3, FileText, Download, RefreshCw, Archive, RotateCcw,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  useListCampagnes,
  useGetCampagneActive,
  useCreateCampagne,
  useVerifierCampagne,
  useCloturerCampagne,
  useGetBilanCampagne,
  useGetComparaisonCampagnes,
  getListCampagnesQueryOptions,
  getVerifierCampagneQueryKey,
  getGetBilanCampagneQueryKey,
  getGetComparaisonCampagnesQueryKey,
  type Campagne,
  type CampagneInput,
  type VerificationCloture,
  type BilanCampagne,
  type ComparaisonBilanCampagne,
} from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const INPUT_CLS =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";
const BTN =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

type Tab = "campagnes" | "cloture" | "bilans";

function getQueryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "La liste des campagnes n’a pas pu être chargée. Vérifiez votre connexion puis réessayez.";
}

function StatutBadge({ statut }: { statut: string }) {
    if (statut === "programmee") return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <Clock className="w-3 h-3" /> Programmée
      </span>
    );
    if (statut === "ouverte") return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" /> En cours
      </span>
    );
    if (statut === "archivee") return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
        <Archive className="w-3 h-3" /> Archivée
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        <Clock className="w-3 h-3" /> Clôturée
      </span>
    );
  }

const fmt = (n: string | number | null | undefined) =>
  Number(n ?? 0).toLocaleString("fr-FR");

const fmtPct = (n: string | number | null | undefined) => {
  const v = Number(n ?? 0);
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)} %`;
};

function VerifItem({ v }: { v: VerificationCloture }) {
  const Icon =
    v.statut === "ok" ? CheckCircle2 :
    v.statut === "bloquant" ? XCircle :
    AlertTriangle;
  const cls =
    v.statut === "ok" ? "text-green-600 bg-green-50 border-green-100" :
    v.statut === "bloquant" ? "text-red-600 bg-red-50 border-red-100" :
    "text-amber-600 bg-amber-50 border-amber-100";

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${cls}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs font-semibold">{v.code} — {v.verification}</div>
        <div className="text-xs opacity-80 mt-0.5">{v.message}</div>
      </div>
    </div>
  );
}

function KpiCard({ label, valeur, sous, montantFcfa }: { label: string; valeur: string; sous?: string; montantFcfa?: number }) {
  const valeurMobile = montantFcfa !== undefined
    ? (montantFcfa >= 1_000_000 ? `${(montantFcfa / 1_000_000).toFixed(1).replace(/\.0$/, "")} M FCFA`
      : montantFcfa >= 1_000 ? `${Math.round(montantFcfa / 1_000)} k FCFA`
      : `${montantFcfa} FCFA`)
    : undefined;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 min-w-0">
      <div className="text-xs font-medium text-gray-500 mb-1 leading-snug">{label}</div>
      {valeurMobile ? (
        <>
          <div className="sm:hidden text-base font-bold text-gray-900 leading-tight">{valeurMobile}</div>
          <div className="hidden sm:block text-xl font-bold text-gray-900">{valeur}</div>
        </>
      ) : (
        <div className="text-base sm:text-xl font-bold text-gray-900 leading-tight break-words">{valeur}</div>
      )}
      {sous && <div className="text-xs text-gray-400 mt-0.5 leading-snug">{sous}</div>}
    </div>
  );
}

function BilanDetail({ bilan }: { bilan: BilanCampagne }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Tonnage collecté" valeur={`${fmt(bilan.tonnageTotalKg)} kg`} sous={`${fmt(bilan.nbLivraisons)} livraisons`} />
        <KpiCard label="CA ventes" valeur={`${fmt(bilan.caVentesFcfa)} FCFA`} montantFcfa={Number(bilan.caVentesFcfa ?? 0)} sous={`${fmt(bilan.nbExportateurs)} exportateurs`} />
        <KpiCard label="Marge nette" valeur={`${fmt(bilan.margeNetteFcfa)} FCFA`} montantFcfa={Number(bilan.margeNetteFcfa ?? 0)} sous={`${fmt(bilan.margeKgFcfa)} FCFA/kg`} />
        <KpiCard label="Membres actifs" valeur={String(bilan.nbMembresActifs ?? 0)} />
        <KpiCard label="Prix achat moy." valeur={`${fmt(bilan.prixAchatMoyenKgFcfa)} FCFA/kg`} />
        <KpiCard label="Prix vente moy." valeur={`${fmt(bilan.prixVenteMoyenKgFcfa)} FCFA/kg`} />
      </div>
      {(bilan.variationTonnagePct != null) && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <div className="text-xs font-semibold text-gray-600 mb-2">Évolution vs campagne précédente</div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Tonnage", bilan.variationTonnagePct],
              ["CA ventes", bilan.variationCaPct],
              ["Marge nette", bilan.variationMargePct],
            ].map(([label, val]) => (
              <div key={String(label)} className="text-center">
                <div className="text-xs text-gray-500">{label}</div>
                <div className={`text-sm font-bold ${Number(val ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmtPct(val)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampagnesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { utilisateur } = useAuth();
  const isDelegue = utilisateur?.role === "delegue";
  const peutCreer = usePermission("campagnes", "creer");
  const peutVerifier = usePermission("campagnes", "verifier");
  const peutCloturer = usePermission("campagnes", "cloturer");
  const peutVoirBilan = usePermission("campagnes", "voir_bilan");

  const [tab, setTab] = useState<Tab>("campagnes");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<CampagneInput>>({
    dateOuverture: new Date().toISOString().slice(0, 10),
    anneeDebut: new Date().getFullYear(),
    anneeFin: new Date().getFullYear() + 1,
  });
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    data: campagnes,
    isLoading,
    isError: campagnesError,
    error: campagnesQueryError,
    refetch: refetchCampagnes,
  } = useListCampagnes();
  const { data: active } = useGetCampagneActive();
  const activeId = active?.id ?? 0;

  const { data: verifs, isLoading: verifsLoading, refetch: refetchVerifs } =
    useVerifierCampagne(activeId, {
      query: { enabled: false, queryKey: getVerifierCampagneQueryKey(activeId) },
    });

  const { data: bilanData, isLoading: bilanLoading, isError: bilanError, error: bilanQueryError, refetch: refetchBilan } =
    useGetBilanCampagne(activeId, {
      query: { enabled: tab === "cloture" && !!activeId, queryKey: getGetBilanCampagneQueryKey(activeId), retry: 1 },
    });

  const { data: comparaison, isLoading: comparaisonLoading } =
    useGetComparaisonCampagnes(undefined, {
      query: { enabled: tab === "bilans", queryKey: getGetComparaisonCampagnesQueryKey() },
    });

  const [rattachPending, setRattachPending] = useState(false);
  const [rattachMsg, setRattachMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [downloadingBilans, setDownloadingBilans] = useState<Set<number>>(new Set());
  const [archiverPending, setArchiverPending] = useState<Set<number>>(new Set());
  const [ouvrirPending, setOuvrirPending] = useState<Set<number>>(new Set());

  async function handleOuvrirProgrammee(campagneId: number) {
    if (ouvrirPending.has(campagneId)) return;
    setOuvrirPending(prev => new Set(prev).add(campagneId));
    try {
      const BASE = import.meta.env.VITE_API_URL ?? "";
      const tok = localStorage.getItem("coop_token") ?? "";
      const r = await fetch(`${BASE}/api/campagnes/${campagneId}/ouvrir`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await r.json() as { erreur?: string };
      if (!r.ok) throw new Error(data.erreur ?? `Erreur ${r.status}`);
      await queryClient.invalidateQueries(getListCampagnesQueryOptions());
      toast({ title: "Campagne ouverte avec succès" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erreur inconnue", variant: "destructive" });
    } finally {
      setOuvrirPending(prev => { const s = new Set(prev); s.delete(campagneId); return s; });
    }
  }

  async function handleArchiver(campagneId: number) {
    if (archiverPending.has(campagneId)) return;
    setArchiverPending(prev => new Set(prev).add(campagneId));
    try {
      const BASE = import.meta.env.VITE_API_URL ?? "";
      const tok = localStorage.getItem("coop_token") ?? "";
      const r = await fetch(`${BASE}/api/archives/${campagneId}/archiver`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await r.json() as { erreur?: string };
      if (!r.ok) throw new Error(data.erreur ?? `Erreur ${r.status}`);
      await queryClient.invalidateQueries(getListCampagnesQueryOptions());
      toast({ title: "Campagne archivée avec succès" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erreur archivage", variant: "destructive" });
    } finally {
      setArchiverPending(prev => { const s = new Set(prev); s.delete(campagneId); return s; });
    }
  }

    const [rouvrirId, setRouvrirId] = useState<number | null>(null);
    const [rouvrirMotif, setRouvrirMotif] = useState("");
    const [rouvrirPending, setRouvrirPending] = useState(false);

  async function downloadBilan(campagneId: number, libelle: string) {
    if (downloadingBilans.has(campagneId)) return;
    setDownloadingBilans((prev) => new Set(prev).add(campagneId));
    try {
      const BASE = import.meta.env.VITE_API_URL ?? "";
      const tok = localStorage.getItem("coop_token") ?? "";
      const r = await fetch(`${BASE}/api/campagnes/${campagneId}/bilan-pdf`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      const blob = await r.blob();
      openPdfViewer(URL.createObjectURL(blob), `bilan-${libelle.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    } catch {
      // erreur silencieuse
    } finally {
      setDownloadingBilans((prev) => { const s = new Set(prev); s.delete(campagneId); return s; });
    }
  }

  async function handleRouvrir() {
      if (!rouvrirId) return;
      if (rouvrirMotif.trim().length < 10) {
        toast({ title: "Motif trop court (10 caractères minimum)", variant: "destructive" });
        return;
      }
      setRouvrirPending(true);
      try {
        const BASE = import.meta.env.VITE_API_URL ?? "";
        const tok = localStorage.getItem("coop_token") ?? "";
        const r = await fetch(`${BASE}/api/campagnes/${rouvrirId}/rouvrir`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
          body: JSON.stringify({ motif: rouvrirMotif }),
        });
        const data = await r.json() as { erreur?: string };
        if (!r.ok) throw new Error(data.erreur ?? `Erreur ${r.status}`);
        await queryClient.invalidateQueries(getListCampagnesQueryOptions());
        toast({ title: "Campagne réouverte avec succès" });
        setRouvrirId(null);
        setRouvrirMotif("");
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : "Erreur inconnue", variant: "destructive" });
      } finally {
        setRouvrirPending(false);
      }
    }

    const createMut = useCreateCampagne();
  const cloturerMut = useCloturerCampagne();

  function handleField<K extends keyof CampagneInput>(k: K, v: CampagneInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.libelle || !form.anneeDebut || !form.anneeFin || !form.dateOuverture) return;
    try {
      const result = await createMut.mutateAsync({ data: form as CampagneInput });
      await queryClient.invalidateQueries(getListCampagnesQueryOptions());
      const isProgrammee = (result as { statut?: string }).statut === "programmee";
      toast({
        title: isProgrammee
          ? `Campagne programmée pour le ${new Date(form.dateOuverture!).toLocaleDateString("fr-FR")}`
          : "Campagne créée et ouverte avec succès",
      });
      setShowForm(false);
      setForm({
        dateOuverture: new Date().toISOString().slice(0, 10),
        anneeDebut: new Date().getFullYear(),
        anneeFin: new Date().getFullYear() + 1,
      });
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  }

  async function handleRattacher() {
    if (!activeId) return;
    setRattachPending(true);
    setRattachMsg(null);
    try {
      const BASE = import.meta.env.VITE_API_URL ?? "";
      const tok = localStorage.getItem("coop_token") ?? "";
      const r = await fetch(`${BASE}/api/campagnes/${activeId}/rattacher-livraisons`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      });
      const data = await r.json() as { rattachées?: number };
      if (!r.ok) throw new Error((data as { erreur?: string }).erreur ?? r.statusText);
      const n = data.rattachées ?? 0;
      setRattachMsg({ ok: true, text: n > 0 ? `✓ ${n} livraison(s) rattachée(s) à cette campagne.` : "Aucune livraison orpheline trouvée." });
    } catch (err) {
      setRattachMsg({ ok: false, text: err instanceof Error ? err.message : "Erreur inconnue" });
    } finally {
      setRattachPending(false);
    }
  }

  async function handleLancerVerifs() {
    await refetchVerifs();
  }

  // Normalise une chaîne de confirmation : trim, espaces multiples → un seul,
  // tirets typographiques (–, —) → tiret ASCII (-).
  function normalizeConfirm(s: string) {
    return s.trim().replace(/\s+/g, " ").replace(/[\u2013\u2014]/g, "-");
  }

  async function handleCloturer() {
    if (!active) return;
    const expected = `CLOTURER ${active.libelle}`;
    if (normalizeConfirm(confirmText) !== normalizeConfirm(expected)) {
      toast({ title: `Saisir exactement : ${expected}`, variant: "destructive" });
      return;
    }
    try {
      await cloturerMut.mutateAsync({ id: activeId });
      await queryClient.invalidateQueries(getListCampagnesQueryOptions());
      toast({ title: "Campagne clôturée avec succès" });
      setShowConfirm(false);
      setConfirmText("");
      setTab("bilans");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ title: msg, variant: "destructive" });
    }
  }

  const bloquants = verifs?.bloquants ?? [];
  const avertissements = verifs?.avertissements ?? [];
  const okItems = verifs?.ok ?? [];
  const toutOk = verifs?.toutOk ?? false;
  const peutConfirmer = verifs != null && bloquants.length === 0;

  // Relancer le chargement du bilan dès que les vérifications passent.
  // La requête auto-fetch se déclenche à l'ouverture de l'onglet, mais si elle
  // a échoué ou si activeId n'était pas encore disponible, elle ne se relance
  // pas seule. On force un refetch quand peutConfirmer passe à true.
  useEffect(() => {
    if (peutConfirmer && !!activeId && !bilanData?.bilan && !bilanLoading) {
      refetchBilan();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peutConfirmer, activeId]);

  const allTabs = [
    { id: "campagnes" as Tab, label: "Campagnes", labelMobile: "Camp.", icon: CalendarDays },
    { id: "cloture" as Tab,   label: "Clôture",   labelMobile: "Clôture", icon: XCircle, disabled: !active },
    { id: "bilans" as Tab,    label: "Bilans & comparaisons", labelMobile: "Bilans", icon: BarChart3 },
  ];
  const tabs = isDelegue ? allTabs.filter(t => t.id !== "cloture") : allTabs;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Campagnes agricoles</h1>
            <p className="text-sm text-gray-500">Gestion, clôture et bilans</p>
          </div>
        </div>
        {tab === "campagnes" && peutCreer && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => setShowForm(v => !v)}
              disabled={!!active}
              title={active ? `Clôturez "${active.libelle}" avant d'en créer une nouvelle` : undefined}
              className={`${BTN} bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Plus className="w-4 h-4" /> Nouvelle campagne
            </button>
            {active && (
              <span className="text-xs text-amber-600 font-medium">
                Clôturez la campagne en cours en premier
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.id}
            disabled={t.disabled}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${tab === t.id ? "bg-white text-green-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}
              ${t.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <t.icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">{t.label}</span>
            <span className="sm:hidden truncate">{t.labelMobile}</span>
          </button>
        ))}
      </div>

      {/* ── ONGLET 1 : CAMPAGNES ───────────────────────────── */}
      {tab === "campagnes" && (
        <div className="space-y-5">
          {/* Formulaire création */}
          {showForm && peutCreer && (
            <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Nouvelle campagne</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Libellé *</label>
                  <input className={INPUT_CLS} placeholder="Ex : Campagne 2026-2027" value={form.libelle ?? ""}
                    onChange={e => handleField("libelle", e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Année début *</label>
                  <input type="number" className={INPUT_CLS} value={form.anneeDebut ?? ""}
                    onChange={e => handleField("anneeDebut", parseInt(e.target.value))} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Année fin *</label>
                  <input type="number" className={INPUT_CLS} value={form.anneeFin ?? ""}
                    onChange={e => handleField("anneeFin", parseInt(e.target.value))} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date d'ouverture *</label>
                  <input type="date" className={INPUT_CLS} value={form.dateOuverture ?? ""}
                    onChange={e => handleField("dateOuverture", e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date de clôture <span className="text-gray-400 font-normal">(optionnel)</span></label>
                  <input type="date" className={INPUT_CLS} value={form.dateFermeture ?? ""}
                    onChange={e => handleField("dateFermeture", e.target.value || null)} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Objectif de collecte (kg) <span className="text-gray-400 font-normal">(optionnel)</span></label>
                  <input type="number" min="0" className={INPUT_CLS} placeholder="Ex : 500000"
                    value={(form as { tonnageCibleKg?: string | null }).tonnageCibleKg ?? ""}
                    onChange={e => handleField("tonnageCibleKg" as keyof CampagneInput, e.target.value || null)} />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className={`${BTN} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
                  Annuler
                </button>
                <button type="submit" disabled={createMut.isPending} className={`${BTN} bg-green-600 text-white hover:bg-green-700`}>
                  {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Créer
                </button>
              </div>
            </form>
          )}

          {/* Bannière campagne active */}
          {active && (
            <div className="bg-green-600 rounded-xl p-5 text-white space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium opacity-80 mb-1">Campagne en cours</div>
                  <div className="text-lg font-bold">{active.libelle}</div>
                  <div className="text-sm opacity-90">{active.anneeDebut}–{active.anneeFin}</div>
                </div>
                <CheckCircle2 className="w-8 h-8 opacity-40" />
              </div>
              {peutCloturer && (
                <div className="border-t border-white/20 pt-3 flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleRattacher}
                    disabled={rattachPending}
                    className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {rattachPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Rattacher livraisons orphelines
                  </button>
                  {rattachMsg && (
                    <span className={`text-xs px-2 py-1 rounded-md ${rattachMsg.ok ? "bg-white/20 text-white" : "bg-red-200/30 text-red-100"}`}>
                      {rattachMsg.text}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Timeline des campagnes */}
          {campagnesError ? (
            <div
              role="alert"
              className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
            >
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Impossible de charger les campagnes</p>
                <p className="mt-1 break-words text-sm text-red-700">
                  {getQueryErrorMessage(campagnesQueryError)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refetchCampagnes()}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                <RefreshCw className="w-4 h-4" />
                Réessayer
              </button>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-200" />
              {(campagnes ?? []).map((c, i) => (
                <div key={c.id} className="relative mb-4">
                  <div className={`absolute -left-4 top-4 w-4 h-4 rounded-full border-2 ${c.statut === "programmee" ? "bg-blue-400 border-blue-500" : c.statut === "ouverte" ? "bg-green-500 border-green-600" : c.statut === "archivee" ? "bg-purple-400 border-purple-500" : "bg-gray-300 border-gray-400"}`} />
                  <div className={`rounded-xl border p-4 ${c.statut === "programmee" ? "border-blue-200 bg-blue-50/40" : c.statut === "ouverte" ? "border-green-200 bg-green-50" : c.statut === "archivee" ? "border-purple-100 bg-purple-50/30" : "border-gray-200 bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{c.libelle}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{c.anneeDebut}–{c.anneeFin}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {c.statut === "programmee"
                            ? <>Ouverture prévue le {new Date(c.dateOuverture).toLocaleDateString("fr-FR")}</>
                            : <>Ouverture : {new Date(c.dateOuverture).toLocaleDateString("fr-FR")}</>}
                          {c.dateFermeture && <> · Clôture : {new Date(c.dateFermeture).toLocaleDateString("fr-FR")}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <StatutBadge statut={c.statut} />
                        {c.statut === "programmee" && peutCreer && (
                          <button
                            onClick={() => handleOuvrirProgrammee(c.id)}
                            disabled={ouvrirPending.has(c.id) || !!active}
                            title={active ? `Clôturez "${active.libelle}" avant d'ouvrir une nouvelle campagne` : undefined}
                            className={`${BTN} bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs px-3 py-1.5`}>
                            {ouvrirPending.has(c.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Ouvrir maintenant
                          </button>
                        )}
                        {c.statut === "ouverte" && peutCloturer && (
                          <button onClick={() => setTab("cloture")}
                            className={`${BTN} bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs px-3 py-1.5`}>
                            Clôturer
                          </button>
                        )}
                        {c.statut === "fermee" && peutVoirBilan && (
                            <button onClick={() => setTab("bilans")}
                              className={`${BTN} bg-gray-50 text-gray-600 hover:bg-gray-100 text-xs px-3 py-1.5`}>
                              <BarChart3 className="w-3.5 h-3.5" /> Bilan
                            </button>
                          )}
                          {c.statut === "fermee" && (utilisateur?.role === "pca" || utilisateur?.role === "directeur") && (
                            <button
                              onClick={() => handleArchiver(c.id)}
                              disabled={archiverPending.has(c.id)}
                              className={`${BTN} bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs px-3 py-1.5`}>
                              {archiverPending.has(c.id)
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Archive className="w-3.5 h-3.5" />}
                              Archiver
                            </button>
                          )}
                          {c.statut === "fermee" && utilisateur?.role === "pca" && (
                            <button
                              onClick={() => { setRouvrirId(c.id); setRouvrirMotif(""); }}
                              disabled={!!active}
                              title={active ? `Clôturez "${active.libelle}" avant de réouvrir une autre campagne` : undefined}
                              className={`${BTN} bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs px-3 py-1.5`}>
                              <RotateCcw className="w-3.5 h-3.5" /> Réouvrir
                            </button>
                          )}
                        </div>
                    </div>
                  </div>
                </div>
              ))}
              {!campagnes?.length && (
                <div className="text-center py-12 text-gray-400">
                  <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Aucune campagne enregistrée
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modal réouverture campagne ───────────────────── */}
        {rouvrirId != null && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Réouvrir la campagne</h2>
                  <p className="text-xs text-gray-500">Un motif détaillé est obligatoire</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700">
                  La réouverture remet la campagne en statut actif. Les opérations redeviennent possibles.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Motif <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal"> (10 caractères min.)</span>
                </label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
                  rows={3}
                  placeholder="Ex : Erreur de saisie détectée sur plusieurs livraisons..."
                  value={rouvrirMotif}
                  onChange={e => setRouvrirMotif(e.target.value)}
                />
                <div className="text-right text-xs text-gray-400 mt-0.5">{rouvrirMotif.length} / 10 min.</div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setRouvrirId(null); setRouvrirMotif(""); }}
                  className={`${BTN} bg-gray-100 text-gray-700 hover:bg-gray-200`}
                >Annuler</button>
                <button
                  onClick={() => void handleRouvrir()}
                  disabled={rouvrirMotif.trim().length < 10 || rouvrirPending}
                  className={`${BTN} bg-amber-600 text-white hover:bg-amber-700`}
                >
                  {rouvrirPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Réouvrir
                </button>
              </div>
            </div>
          </div>
        )}

              {/* ── ONGLET 2 : CLÔTURE ────────────────────────────── */}
      {tab === "cloture" && (
        <div className="space-y-5">
          {!active ? (
            <div className="text-center py-12 text-gray-400">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              Aucune campagne active à clôturer
            </div>
          ) : (
            <>
              {/* Infos campagne active */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-semibold">Clôture de : {active.libelle}</span>
                </div>
                <p className="text-xs text-amber-600 mt-1">
                  La clôture est irréversible. Toutes les opérations de cette campagne passeront en lecture seule.
                </p>
              </div>

              {/* ÉTAPE 1 : Vérifications */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-gray-900">Étape 1 — Vérifications pré-clôture</h2>
                    <p className="text-xs text-gray-500 mt-0.5">10 contrôles automatiques avant de clôturer</p>
                  </div>
                  {peutVerifier && (
                    <button onClick={handleLancerVerifs} disabled={verifsLoading}
                      className={`${BTN} bg-blue-600 text-white hover:bg-blue-700`}>
                      {verifsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Lancer les vérifications
                    </button>
                  )}
                </div>

                {verifs == null && !verifsLoading && (
                  <div className="text-center py-8 text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    Cliquer sur « Lancer les vérifications » pour démarrer
                  </div>
                )}

                {verifs != null && (
                  <div className="space-y-4">
                    {/* Résumé */}
                    <div className={`flex items-center gap-3 p-3 rounded-lg text-sm font-medium ${toutOk ? "bg-green-50 text-green-700" : bloquants.length > 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                      {toutOk ? <CheckCircle2 className="w-5 h-5" /> : bloquants.length > 0 ? <XCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                      {toutOk
                        ? "Toutes les vérifications sont passées. Vous pouvez clôturer."
                        : bloquants.length > 0
                        ? `${bloquants.length} point(s) bloquant(s) à résoudre avant de clôturer`
                        : `${avertissements.length} avertissement(s) — clôture possible avec confirmation`}
                    </div>

                    {bloquants.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">Bloquants</div>
                        {bloquants.map(v => <VerifItem key={v.code} v={v} />)}
                      </div>
                    )}
                    {avertissements.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Avertissements</div>
                        {avertissements.map(v => <VerifItem key={v.code} v={v} />)}
                      </div>
                    )}
                    {okItems.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-green-600 uppercase tracking-wide">Contrôles validés</div>
                        {okItems.map(v => <VerifItem key={v.code} v={v} />)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ÉTAPE 2 : Aperçu bilan + confirmation */}
              {peutCloturer && peutConfirmer && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="font-semibold text-gray-900 mb-4">Étape 2 — Aperçu du bilan & confirmation</h2>

                  {bilanLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-green-600" /></div>
                  ) : bilanData?.bilan ? (
                    <>
                      <BilanDetail bilan={bilanData.bilan} />
                      <div className="mt-5">
                        <button onClick={() => setShowConfirm(v => !v)}
                          className={`${BTN} bg-red-600 text-white hover:bg-red-700`}>
                          <XCircle className="w-4 h-4" />
                          Confirmer la clôture définitive
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-6">
                      {bilanError && (
                        <p className="text-sm text-red-600 text-center">
                          {bilanQueryError?.message ?? "Impossible de charger l'aperçu du bilan."}
                        </p>
                      )}
                      <button onClick={() => refetchBilan()} disabled={bilanLoading} className={`${BTN} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
                        {bilanLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {bilanError ? "Réessayer" : "Générer l'aperçu du bilan"}
                      </button>
                    </div>
                  )}

                  {showConfirm && (
                    <div className="mt-5 p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                      <p className="text-sm text-red-700 font-medium">Cette action est irréversible.</p>
                      <p className="text-xs text-red-600">
                        Saisir <span className="font-mono font-bold">CLOTURER {active.libelle}</span> pour confirmer
                      </p>
                      <input
                        className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white font-mono"
                        placeholder={`CLOTURER ${active.libelle}`}
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                      />
                      <div className="flex gap-3">
                        <button onClick={() => { setShowConfirm(false); setConfirmText(""); }}
                          className={`${BTN} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
                          Annuler
                        </button>
                        <button
                          disabled={normalizeConfirm(confirmText) !== normalizeConfirm(`CLOTURER ${active.libelle}`) || cloturerMut.isPending}
                          onClick={handleCloturer}
                          className={`${BTN} bg-red-600 text-white hover:bg-red-700`}>
                          {cloturerMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                          Clôturer définitivement
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ONGLET 3 : BILANS & COMPARAISONS ─────────────── */}
      {tab === "bilans" && (
        <div className="space-y-5">
          {comparaisonLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div>
          ) : (
            <>
              {/* Tableau comparatif */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Comparaison des campagnes</h2>
                  <p className="text-xs text-gray-500 mt-0.5">5 dernières campagnes côte à côte</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs">Indicateur</th>
                        {(comparaison ?? []).map(({ campagne: c }) => (
                          <th key={c.id} className="text-right px-4 py-3 font-medium text-xs">
                            <div>{c.libelle}</div>
                            <StatutBadge statut={c.statut} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[
                        { label: "Tonnage (kg)", field: "tonnageTotalKg" as keyof BilanCampagne },
                        { label: "CA ventes (FCFA)", field: "caVentesFcfa" as keyof BilanCampagne },
                        { label: "Marge nette (FCFA)", field: "margeNetteFcfa" as keyof BilanCampagne },
                        { label: "Marge/kg (FCFA)", field: "margeKgFcfa" as keyof BilanCampagne },
                        { label: "Membres actifs", field: "nbMembresActifs" as keyof BilanCampagne },
                        { label: "Prix achat moy. (FCFA/kg)", field: "prixAchatMoyenKgFcfa" as keyof BilanCampagne },
                        { label: "Prix vente moy. (FCFA/kg)", field: "prixVenteMoyenKgFcfa" as keyof BilanCampagne },
                      ].map(row => (
                        <tr key={row.field} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600 text-xs font-medium">{row.label}</td>
                          {(comparaison ?? []).map(({ campagne: c, bilan }) => (
                            <td key={c.id} className="px-4 py-3 text-right text-xs text-gray-800 font-mono">
                              {bilan ? fmt(bilan[row.field] as string) : <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Graphiques */}
              {(comparaison ?? []).some(({ bilan }) => bilan != null) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tonnage par campagne */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Tonnage collecté (kg)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={(comparaison ?? []).filter(({ bilan }) => bilan != null).map(({ campagne: c, bilan }) => ({
                        name: `${c.anneeDebut}-${String(c.anneeFin).slice(-2)}`,
                        tonnage: Number(bilan?.tonnageTotalKg ?? 0),
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}t`} />
                        <Tooltip formatter={(v: number) => [`${v.toLocaleString("fr-FR")} kg`, "Tonnage"]} />
                        <Bar dataKey="tonnage" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Évolution marge/kg */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Évolution marge/kg (FCFA)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={(comparaison ?? []).filter(({ bilan }) => bilan != null).map(({ campagne: c, bilan }) => ({
                        name: `${c.anneeDebut}-${String(c.anneeFin).slice(-2)}`,
                        marge: Number(bilan?.margeKgFcfa ?? 0),
                        prixAchat: Number(bilan?.prixAchatMoyenKgFcfa ?? 0),
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [`${v.toLocaleString("fr-FR")} FCFA/kg`]} />
                        <Legend />
                        <Line type="monotone" dataKey="marge" stroke="#16a34a" name="Marge/kg" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="prixAchat" stroke="#6b7280" name="Prix achat moy." strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 5" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Boutons téléchargement PDF par campagne */}
              {peutVoirBilan && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Télécharger les bilans PDF</h3>
                  <div className="flex flex-wrap gap-2">
                    {(comparaison ?? []).filter(({ bilan }) => bilan != null).map(({ campagne: c }) => (
                      <button
                        key={c.id}
                        onClick={() => void downloadBilan(c.id, c.libelle)}
                        disabled={downloadingBilans.has(c.id)}
                        className={`${BTN} bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 text-xs disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {downloadingBilans.has(c.id)
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Download className="w-3.5 h-3.5" />}
                        {c.libelle}
                      </button>
                    ))}
                  </div>
                  {!(comparaison ?? []).some(({ bilan }) => bilan != null) && (
                    <p className="text-xs text-gray-400">Aucun bilan généré pour le moment</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

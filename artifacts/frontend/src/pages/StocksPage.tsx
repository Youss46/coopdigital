import { useState, useEffect } from "react";
import {
  useGetEntrepots,
  useEntreeStock,
  useSortieStock,
  useGetStockAlertes,
} from "@workspace/api-client-react";
import {
  getGetEntrepotsQueryKey,
  getGetMouvementsStockQueryKey,
  getGetStockAlertesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Warehouse, TrendingUp, TrendingDown, AlertTriangle, PlusCircle, PackageCheck, Clock, ArrowRight, Boxes, Pencil, Trash2, X, CalendarDays, MapPin } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { usePermission } from "@/hooks/usePermission";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
  return r.json();
}
async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
  return r.json();
}
async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: hdr() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
}

function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formaterPoids(kg: string | number) {
  const v = parseFloat(String(kg));
  return v >= 1000 ? `${(v / 1000).toFixed(2)} T` : `${v.toFixed(1)} kg`;
}

interface LotissementStats {
  poidsTotal: number;
  poidsLoti: number;
  poidsNonLoti: number;
}

type PeriodeFilter = "all" | "today" | "week" | "month" | "custom";

function getPeriodeDates(periode: PeriodeFilter, customDebut = "", customFin = ""): { date_debut?: string; date_fin?: string } {
  if (periode === "custom") {
    return {
      ...(customDebut ? { date_debut: customDebut } : {}),
      ...(customFin   ? { date_fin:   customFin   } : {}),
    };
  }
  if (periode === "all") return {};
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // Le backend attend YYYY-MM-DD et concatène lui-même "T23:59:59Z" pour date_fin
  if (periode === "today") {
    const today = fmt(now);
    return { date_debut: today, date_fin: today };
  }
  if (periode === "week") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const monday = new Date(now); monday.setDate(now.getDate() - day);
    return { date_debut: fmt(monday), date_fin: fmt(now) };
  }
  if (periode === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { date_debut: fmt(first), date_fin: fmt(now) };
  }
  return {};
}

export default function StocksPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const peutEntree = usePermission("stocks", "entree");
  const peutSortie = usePermission("stocks", "sortie");
  const [onglet, setOnglet] = useState<"entrepots" | "journal">("entrepots");
  const [filtreTransfert, setFiltreTransfert] = useState<string>("");
  const [periode, setPeriode] = useState<PeriodeFilter>("all");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [modalMouvement, setModalMouvement] = useState<"entree" | "sortie" | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const tab = params.get("tab");
    const q = params.get("q") ?? "";
    if (tab === "journal") {
      setOnglet("journal");
      setFiltreTransfert(q);
    }
  }, [search]);
  const [form, setForm] = useState({ entrepotId: "", poidsKg: "", nombreSacs: "", motif: "" });
  const [modalEntrepot, setModalEntrepot] = useState(false);
  const [formEntrepot, setFormEntrepot] = useState({ nom: "", ville: "", capaciteKg: "", capaciteSacs: "", seuilAlerteKg: "", pourFournisseursExt: false });
  const [errEntrepot, setErrEntrepot] = useState("");
  const FORM_VIDE = { nom: "", ville: "", capaciteKg: "", capaciteSacs: "", seuilAlerteKg: "", pourFournisseursExt: false };

  // Edit / delete state
  type EntrepotItem = { id: number; nom: string; ville: string; capaciteKg: string | number; capaciteSacs?: number | null; seuilAlerteKg?: string | number | null; pourFournisseursExt?: boolean };
  const [editingEntrepot, setEditingEntrepot] = useState<EntrepotItem | null>(null);
  const [deletingEntrepot, setDeletingEntrepot] = useState<EntrepotItem | null>(null);
  const [errEdit, setErrEdit] = useState("");
  const [errDelete, setErrDelete] = useState("");

  const mutCreerEntrepot = useMutation({
    mutationFn: () => apiPost("/api/stocks/entrepots", {
      nom: formEntrepot.nom,
      ville: formEntrepot.ville,
      capaciteKg: parseFloat(formEntrepot.capaciteKg),
      capaciteSacs: formEntrepot.capaciteSacs ? parseInt(formEntrepot.capaciteSacs) : undefined,
      seuilAlerteKg: formEntrepot.seuilAlerteKg ? parseFloat(formEntrepot.seuilAlerteKg) : undefined,
      pourFournisseursExt: formEntrepot.pourFournisseursExt,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetEntrepotsQueryKey() });
      setModalEntrepot(false);
      setFormEntrepot(FORM_VIDE);
      setErrEntrepot("");
    },
    onError: (e: Error) => setErrEntrepot(e.message),
  });

  const mutModifierEntrepot = useMutation({
    mutationFn: () => apiPut(`/api/stocks/entrepots/${editingEntrepot!.id}`, {
      nom: formEntrepot.nom,
      ville: formEntrepot.ville,
      capaciteKg: parseFloat(formEntrepot.capaciteKg),
      capaciteSacs: formEntrepot.capaciteSacs ? parseInt(formEntrepot.capaciteSacs) : "",
      seuilAlerteKg: formEntrepot.seuilAlerteKg ? parseFloat(formEntrepot.seuilAlerteKg) : "",
      pourFournisseursExt: formEntrepot.pourFournisseursExt,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetEntrepotsQueryKey() });
      setEditingEntrepot(null);
      setFormEntrepot(FORM_VIDE);
      setErrEdit("");
    },
    onError: (e: Error) => setErrEdit(e.message),
  });

  const mutSupprimerEntrepot = useMutation({
    mutationFn: () => apiDelete(`/api/stocks/entrepots/${deletingEntrepot!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetEntrepotsQueryKey() });
      setDeletingEntrepot(null);
      setErrDelete("");
    },
    onError: (e: Error) => setErrDelete(e.message),
  });

  function ouvrirEdition(e: EntrepotItem) {
    setFormEntrepot({
      nom: e.nom,
      ville: e.ville,
      capaciteKg: String(parseFloat(String(e.capaciteKg))),
      capaciteSacs: e.capaciteSacs != null ? String(e.capaciteSacs) : "",
      seuilAlerteKg: e.seuilAlerteKg != null ? String(parseFloat(String(e.seuilAlerteKg))) : "",
      pourFournisseursExt: e.pourFournisseursExt ?? false,
    });
    setErrEdit("");
    setEditingEntrepot(e);
  }

  const { data: entrepots = [], isLoading } = useGetEntrepots();
  const { data: alertes = [] } = useGetStockAlertes();

  // Fetch mouvements avec filtre de période (bypass hook Orval pour supporter date_debut/date_fin)
  const periodeDates = getPeriodeDates(periode, dateDebut, dateFin);
  const { data: mouvements = [], isLoading: isLoadingMouvements } = useQuery({
    queryKey: ["stocks-mouvements", periode, dateDebut, dateFin],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (periodeDates.date_debut) params.set("date_debut", periodeDates.date_debut);
      if (periodeDates.date_fin) params.set("date_fin", periodeDates.date_fin);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const r = await fetch(`${BASE}/api/stocks/mouvements${qs}`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error("Erreur chargement mouvements");
      return r.json() as Promise<Array<{ id: number; entrepotNom: string | null; type: string; poidsKg: string; motif: string | null; createdAt: string; nombreSacs?: number | null }>>;
    },
  });
  const { data: lotStats } = useQuery<LotissementStats>({
    queryKey: ["stocks-lotissement-stats"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/stocks/lotissement-stats`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error("Erreur stats lotissement");
      return r.json();
    },
  });

  const mutEntree = useEntreeStock({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEntrepotsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMouvementsStockQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["stocks-mouvements"] });
        queryClient.invalidateQueries({ queryKey: getGetStockAlertesQueryKey() });
        setModalMouvement(null);
        setForm({ entrepotId: "", poidsKg: "", nombreSacs: "", motif: "" });
      },
    },
  });

  const mutSortie = useSortieStock({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEntrepotsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMouvementsStockQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["stocks-mouvements"] });
        queryClient.invalidateQueries({ queryKey: getGetStockAlertesQueryKey() });
        setModalMouvement(null);
        setForm({ entrepotId: "", poidsKg: "", nombreSacs: "", motif: "" });
      },
    },
  });

  // Stock chez les délégués de terrain (entrepôts délégués — distinct des entrepôts centraux)
  const { data: statsDelegues } = useQuery<{
    stockTotalEntrepotsKg: number;
    totalSacsEntrepots: number;
    transfertsEnCours: number;
  }>({
    queryKey: ["entrepots-delegues-stats"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/entrepots/stats`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) return { stockTotalEntrepotsKg: 0, totalSacsEntrepots: 0, transfertsEnCours: 0 };
      return r.json();
    },
    staleTime: 60_000,
  });

  const stockTotal = entrepots.reduce((s, e) => s + e.stockActuelKg, 0);
  const entreesTotal = mouvements
    .filter((m) => m.type === "entree")
    .reduce((s, m) => s + parseFloat(m.poidsKg), 0);
  const sortiesTotal = mouvements
    .filter((m) => m.type === "sortie")
    .reduce((s, m) => s + parseFloat(m.poidsKg), 0);
  const sacsEntreesTotal = mouvements
    .filter((m) => m.type === "entree")
    .reduce((s, m) => s + (m.nombreSacs ?? 0), 0);
  const sacsSortiesTotal = mouvements
    .filter((m) => m.type === "sortie")
    .reduce((s, m) => s + (m.nombreSacs ?? 0), 0);
  const sacsTotalNets = sacsEntreesTotal - sacsSortiesTotal;

  const sacsTotalStock = entrepots.reduce(
    (s, e) => s + ((e as typeof e & { nombreSacsTotal?: number }).nombreSacsTotal ?? 0),
    0,
  );

  const handleSubmitMouvement = () => {
    if (!form.entrepotId || !form.poidsKg) return;
    const data = {
      entrepotId: parseInt(form.entrepotId),
      poidsKg: parseFloat(form.poidsKg),
      nombreSacs: form.nombreSacs ? parseInt(form.nombreSacs) : undefined,
      motif: form.motif || undefined,
    };
    if (modalMouvement === "entree") mutEntree.mutate({ data });
    else mutSortie.mutate({ data });
  };

  const couleurRemplissage = (pct: number) => {
    if (pct >= 90) return "#ef4444";
    if (pct >= 70) return "#f59e0b";
    return "#22c55e";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des stocks</h1>
          <p className="text-gray-500 text-sm mt-1">Suivi des entrepôts et mouvements de cacao</p>
        </div>
        <div className="flex gap-2">
          {peutEntree && (
            <button
              onClick={() => setModalEntrepot(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
            >
              <PlusCircle size={15} />
              Entrepôt
            </button>
          )}
          {peutEntree && (
            <button
              onClick={() => setModalMouvement("entree")}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: "#1a4731" }}
            >
              <TrendingUp size={15} />
              Entrée
            </button>
          )}
          {peutSortie && (
            <button
              onClick={() => setModalMouvement("sortie")}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg bg-blue-600"
            >
              <TrendingDown size={15} />
              Sortie
            </button>
          )}
        </div>
      </div>

      {/* Alertes */}
      {alertes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {alertes.length} entrepôt{alertes.length > 1 ? "s" : ""} en alerte stock bas
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {alertes.map((a) => a.nom).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Cartes KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Stock total", val: formaterPoids(stockTotal), icon: Warehouse, color: "#1a4731", sub: sacsTotalStock > 0 ? `${sacsTotalStock} sac${sacsTotalStock > 1 ? "s" : ""}` : null },
          { label: "Entrées (historique)", val: formaterPoids(entreesTotal), icon: TrendingUp, color: "#22c55e", sub: sacsEntreesTotal > 0 ? `${sacsEntreesTotal} sac${sacsEntreesTotal > 1 ? "s" : ""}` : null },
          { label: "Sorties (historique)", val: formaterPoids(sortiesTotal), icon: TrendingDown, color: "#ef4444", sub: sacsSortiesTotal > 0 ? `${sacsSortiesTotal} sac${sacsSortiesTotal > 1 ? "s" : ""}` : null },
        ].map(({ label, val, icon: Icon, color, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
            <div className="rounded-lg p-2.5" style={{ backgroundColor: color + "15" }}>
              <Icon size={20} style={{ color }} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">{label}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{val}</p>
              {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Encart stock chez les délégués */}
      {statsDelegues && statsDelegues.stockTotalEntrepotsKg > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <div className="rounded-lg p-2 bg-blue-100 shrink-0">
            <MapPin size={16} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-900">
              {formaterPoids(statsDelegues.stockTotalEntrepotsKg)} chez les délégués de terrain
              {statsDelegues.totalSacsEntrepots > 0 && (
                <span className="font-normal text-blue-700 ml-1">
                  · {statsDelegues.totalSacsEntrepots} sac{statsDelegues.totalSacsEntrepots > 1 ? "s" : ""}
                </span>
              )}
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              Ce stock n'est pas encore dans un entrepôt central — il sera intégré ici après le transfert physique.
              {statsDelegues.transfertsEnCours > 0 && (
                <span className="ml-1 font-medium">
                  {statsDelegues.transfertsEnCours} transfert{statsDelegues.transfertsEnCours > 1 ? "s" : ""} en cours.
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setLocation("/entrepots")}
            className="shrink-0 text-xs font-medium text-blue-700 hover:text-blue-900 flex items-center gap-1 whitespace-nowrap"
          >
            Voir les délégués
            <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Lotissement des stocks */}
      {(() => {
        const total = lotStats?.poidsTotal ?? 0;
        const loti = lotStats?.poidsLoti ?? 0;
        const nonLoti = lotStats?.poidsNonLoti ?? 0;
        const pct = total > 0 ? Math.round((loti / total) * 100) : 0;
        const alerte = pct < 20;
        const barColor = alerte ? "#f59e0b" : pct >= 80 ? "#22c55e" : "#1a4731";
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Lotissement des livraisons</p>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: barColor + "20", color: barColor }}>
                {pct}% loti
              </span>
            </div>
            {/* Barre de progression */}
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: barColor }}
              />
            </div>
            {alerte && total > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle size={12} />
                Pensez à regrouper vos livraisons en lots
              </p>
            )}
            {/* Détails */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2.5 bg-green-50 rounded-lg p-3">
                <PackageCheck size={16} className="text-green-600 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">En lots tracés</p>
                  <p className="text-sm font-semibold text-gray-900">{formaterPoids(loti)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-amber-50 rounded-lg p-3">
                <Clock size={16} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">En attente de lot</p>
                  <p className="text-sm font-semibold text-gray-900">{formaterPoids(nonLoti)}</p>
                </div>
              </div>
            </div>
            {/* Bouton */}
            <button
              onClick={() => setLocation("/tracabilite")}
              className="flex items-center gap-1.5 text-xs font-medium text-[#1a4731] hover:underline"
            >
              Créer des lots
              <ArrowRight size={13} />
            </button>
          </div>
        );
      })()}

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["entrepots", "journal"] as const).map((o) => (
          <button
            key={o}
            onClick={() => setOnglet(o)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              onglet === o
                ? "border-[#1a4731] text-[#1a4731]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {o === "entrepots" ? "Entrepôts" : "Journal des mouvements"}
          </button>
        ))}
      </div>

      {/* Tableau entrepôts */}
      {onglet === "entrepots" && (
        <div className="space-y-3">
          {isLoading ? (
            [1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24" style={{ animationDelay: `${i * 100}ms` }} />
            ))
          ) : entrepots.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icone={Warehouse}
                titre="Aucun entrepôt configuré"
                description="Créez un entrepôt pour commencer à suivre vos stocks."
              />
            </div>
          ) : (
            entrepots.map((e) => {
              const pct = Math.min(100, e.pourcentageRemplissage ?? 0);
              const couleur = couleurRemplissage(pct);
              return (
                <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{e.nom}</h3>
                        {e.enAlerte && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded">
                            Alerte
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{e.ville}</p>
                      {(e as typeof e & { nombreSacsTotal?: number }).nombreSacsTotal != null &&
                        (e as typeof e & { nombreSacsTotal?: number }).nombreSacsTotal! > 0 && (
                        <p className="text-xs text-gray-600 mt-1 font-medium">
                          {(e as typeof e & { nombreSacsTotal?: number }).nombreSacsTotal} sacs
                        </p>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">{formaterPoids(e.stockActuelKg)}</p>
                        <p className="text-xs text-gray-400">/ {formaterPoids(e.capaciteKg)}</p>
                        {(e as typeof e & { capaciteSacs?: number | null }).capaciteSacs != null && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            / {(e as typeof e & { capaciteSacs?: number | null }).capaciteSacs} sacs max
                          </p>
                        )}
                      </div>
                      {peutEntree && (
                        <div className="flex flex-col gap-1 ml-1">
                          <button
                            onClick={() => ouvrirEdition(e as EntrepotItem)}
                            title="Modifier l'entrepôt"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => { setDeletingEntrepot(e as EntrepotItem); setErrDelete(""); }}
                            title="Supprimer l'entrepôt"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: couleur }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">{pct}% de remplissage</p>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Journal mouvements */}
      {onglet === "journal" && (
        <div className="space-y-3">
          {/* Filtres période */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtres rapides */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(["all", "today", "week", "month"] as const).map((p) => {
                const labels: Record<PeriodeFilter, string> = { all: "Tout", today: "Aujourd'hui", week: "Semaine", month: "Mois", custom: "Personnalisé" };
                const active = periode === p;
                return (
                  <button
                    key={p}
                    onClick={() => { setPeriode(p); setDateDebut(""); setDateFin(""); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      active
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {labels[p]}
                  </button>
                );
              })}
            </div>

            {/* Séparateur */}
            <span className="text-gray-300 text-xs hidden sm:inline">|</span>

            {/* Plage de dates personnalisée */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <CalendarDays size={13} className="text-gray-400 shrink-0" />
                <span className="text-xs text-gray-500">Du</span>
                <input
                  type="date"
                  value={dateDebut}
                  max={dateFin || undefined}
                  onChange={(e) => { setDateDebut(e.target.value); setPeriode("custom"); }}
                  className={`text-xs border rounded-md px-2 py-1.5 h-7 transition-colors outline-none focus:ring-1 focus:ring-[#1a4731] focus:border-[#1a4731] ${
                    periode === "custom" && dateDebut ? "border-[#1a4731] bg-green-50" : "border-gray-200 bg-white"
                  }`}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Au</span>
                <input
                  type="date"
                  value={dateFin}
                  min={dateDebut || undefined}
                  onChange={(e) => { setDateFin(e.target.value); setPeriode("custom"); }}
                  className={`text-xs border rounded-md px-2 py-1.5 h-7 transition-colors outline-none focus:ring-1 focus:ring-[#1a4731] focus:border-[#1a4731] ${
                    periode === "custom" && dateFin ? "border-[#1a4731] bg-green-50" : "border-gray-200 bg-white"
                  }`}
                />
              </div>
              {periode === "custom" && (dateDebut || dateFin) && (
                <button
                  onClick={() => { setDateDebut(""); setDateFin(""); setPeriode("all"); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  title="Réinitialiser"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {filtreTransfert && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-800">
              <TrendingUp size={14} className="shrink-0" />
              <span>Entrée automatique pour le transfert <span className="font-mono font-semibold">{filtreTransfert}</span> mise en évidence</span>
              <button onClick={() => setFiltreTransfert("")} className="ml-auto text-green-600 hover:text-green-800 font-medium text-xs">✕ Effacer</button>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Entrepôt</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Poids</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Sacs</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Motif</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingMouvements ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Chargement…</td>
                    </tr>
                  ) : mouvements.length === 0 ? (
                    <EmptyState
                      colSpan={6}
                      icone={Boxes}
                      titre="Aucun mouvement enregistré"
                      description="Les entrées et sorties de stock apparaîtront ici."
                    />
                  ) : (
                    mouvements.map((m) => {
                      const estSurbrillance = filtreTransfert
                        ? (m.motif ?? "").includes(filtreTransfert)
                        : false;
                      const nombreSacs = (m as typeof m & { nombreSacs?: number | null }).nombreSacs;
                      return (
                        <tr
                          key={m.id}
                          className={`border-b border-gray-50 transition-colors ${
                            estSurbrillance
                              ? "bg-green-50 border-l-4 border-l-green-500"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <span
                              className={`flex items-center gap-1.5 text-xs font-medium ${
                                m.type === "entree" ? "text-green-700" : "text-red-600"
                              }`}
                            >
                              {m.type === "entree" ? (
                                <TrendingUp size={13} />
                              ) : (
                                <TrendingDown size={13} />
                              )}
                              {m.type === "entree" ? "Entrée" : "Sortie"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{m.entrepotNom ?? "—"}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{formaterPoids(m.poidsKg)}</td>
                          <td className="px-4 py-3">
                            {nombreSacs != null ? (
                              <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
                                {nombreSacs}
                                <span className="text-xs font-normal text-gray-400">sacs</span>
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            {estSurbrillance ? (
                              <span className="text-green-700 font-medium">{m.motif ?? "—"}</span>
                            ) : (
                              <span className="text-gray-500">{m.motif ?? "—"}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                            {formaterDate(m.createdAt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal mouvement */}
      {modalMouvement && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">
                {modalMouvement === "entree" ? "Entrée en stock" : "Sortie de stock"}
              </h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Entrepôt</label>
                <select
                  value={form.entrepotId}
                  onChange={(e) => setForm((f) => ({ ...f, entrepotId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                >
                  <option value="">— Sélectionner —</option>
                  {entrepots.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Poids (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.poidsKg}
                  onChange={(e) => setForm((f) => ({ ...f, poidsKg: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="ex. 1500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantité (nombre de sacs)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={form.nombreSacs}
                  onChange={(e) => setForm((f) => ({ ...f, nombreSacs: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="ex. 50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Motif (optionnel)</label>
                <input
                  type="text"
                  value={form.motif}
                  onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="ex. Réception lot #12"
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setModalMouvement(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmitMouvement}
                disabled={mutEntree.isPending || mutSortie.isPending}
                className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: modalMouvement === "entree" ? "#1a4731" : "#2563eb" }}
              >
                {mutEntree.isPending || mutSortie.isPending ? "Enregistrement…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal créer entrepôt */}
      {modalEntrepot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Créer un entrepôt</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                <input type="text" value={formEntrepot.nom}
                  onChange={(e) => setFormEntrepot((f) => ({ ...f, nom: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="ex. Entrepôt Central Méagui" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ville *</label>
                <input type="text" value={formEntrepot.ville}
                  onChange={(e) => setFormEntrepot((f) => ({ ...f, ville: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="ex. Méagui" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Capacité (kg) *</label>
                  <input type="number" value={formEntrepot.capaciteKg}
                    onChange={(e) => setFormEntrepot((f) => ({ ...f, capaciteKg: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                    placeholder="ex. 50000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Capacité (sacs)</label>
                  <input type="number" value={formEntrepot.capaciteSacs}
                    onChange={(e) => setFormEntrepot((f) => ({ ...f, capaciteSacs: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                    placeholder="ex. 500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Seuil alerte (kg)</label>
                <input type="number" value={formEntrepot.seuilAlerteKg}
                  onChange={(e) => setFormEntrepot((f) => ({ ...f, seuilAlerteKg: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="ex. 5000" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formEntrepot.pourFournisseursExt}
                  onChange={(e) => setFormEntrepot((f) => ({ ...f, pourFournisseursExt: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-700">Entrepôt dédié pisteurs / fournisseurs externes</span>
              </label>
              {errEntrepot && <p className="text-xs text-red-600">{errEntrepot}</p>}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => { setModalEntrepot(false); setErrEntrepot(""); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={() => mutCreerEntrepot.mutate()}
                disabled={mutCreerEntrepot.isPending || !formEntrepot.nom || !formEntrepot.ville || !formEntrepot.capaciteKg}
                className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "#1a4731" }}>
                {mutCreerEntrepot.isPending ? "Enregistrement…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal modifier entrepôt */}
      {editingEntrepot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Modifier l'entrepôt</h3>
              <button onClick={() => { setEditingEntrepot(null); setFormEntrepot(FORM_VIDE); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                <input type="text" value={formEntrepot.nom}
                  onChange={(e) => setFormEntrepot((f) => ({ ...f, nom: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ville *</label>
                <input type="text" value={formEntrepot.ville}
                  onChange={(e) => setFormEntrepot((f) => ({ ...f, ville: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Capacité (kg) *</label>
                  <input type="number" value={formEntrepot.capaciteKg}
                    onChange={(e) => setFormEntrepot((f) => ({ ...f, capaciteKg: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Capacité (sacs)</label>
                  <input type="number" value={formEntrepot.capaciteSacs}
                    onChange={(e) => setFormEntrepot((f) => ({ ...f, capaciteSacs: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Seuil alerte (kg)</label>
                <input type="number" value={formEntrepot.seuilAlerteKg}
                  onChange={(e) => setFormEntrepot((f) => ({ ...f, seuilAlerteKg: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formEntrepot.pourFournisseursExt}
                  onChange={(e) => setFormEntrepot((f) => ({ ...f, pourFournisseursExt: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-xs text-gray-700">Entrepôt dédié pisteurs / fournisseurs externes</span>
              </label>
              {errEdit && <p className="text-xs text-red-600">{errEdit}</p>}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => { setEditingEntrepot(null); setFormEntrepot(FORM_VIDE); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={() => mutModifierEntrepot.mutate()}
                disabled={mutModifierEntrepot.isPending || !formEntrepot.nom || !formEntrepot.ville || !formEntrepot.capaciteKg}
                className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "#1a4731" }}>
                {mutModifierEntrepot.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal supprimer entrepôt */}
      {deletingEntrepot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Supprimer l'entrepôt</h3>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-700">
                Êtes-vous sûr de vouloir supprimer <span className="font-semibold">{deletingEntrepot.nom}</span> ?
              </p>
              <p className="text-xs text-gray-500">
                Cette action est irréversible. Un entrepôt ayant des mouvements de stock ne peut pas être supprimé.
              </p>
              {errDelete && <p className="text-xs text-red-600">{errDelete}</p>}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => { setDeletingEntrepot(null); setErrDelete(""); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={() => mutSupprimerEntrepot.mutate()}
                disabled={mutSupprimerEntrepot.isPending}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50">
                {mutSupprimerEntrepot.isPending ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

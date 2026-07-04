import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Warehouse, Package, TrendingDown, TrendingUp, AlertTriangle,
  Plus, CheckCircle2, XCircle, Clock, Truck, ArrowRight, BarChart3,
  RefreshCw, Eye, Pencil, Power, PowerOff, SlidersHorizontal, ChevronDown, ChevronUp, FileDown,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

const API = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, { ...init, headers: { ...hdr(), ...(init?.headers ?? {}) } });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { erreur?: string }).erreur ?? `Erreur ${res.status}`); }
  return res.json();
}

async function telechargerPdfTransfert(id: number, numero: string) {
  const res = await fetch(`${API}/api/transferts/${id}/pdf`, { headers: { Authorization: `Bearer ${tok()}` } });
  if (!res.ok) throw new Error("Erreur génération PDF");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bon-transfert-${numero}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function kg(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? 0));
  return n >= 1000 ? `${(n / 1000).toFixed(2)} t` : `${n.toFixed(0)} kg`;
}
function pct(stock: string | number | null, capacite: string | number | null) {
  const s = parseFloat(String(stock ?? 0));
  const c = parseFloat(String(capacite ?? 0));
  if (!c) return 0;
  return Math.round((s / c) * 100);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

interface Entrepot {
  id: number; nom: string; zoneNom: string | null; zoneType: string | null;
  capaciteMaxKg: string | null; seuilAlerteKg: string | null;
  stockActuelKg: string; stockMisAJourLe: string | null;
  actif: boolean; delegueId: number;
  delegueNom: string | null; deleguePrenoms: string | null;
  adresse: string | null;
  capaciteSacs?: number | null;
  nombreSacsTotal?: number | null;
}
interface Stats {
  entrepots: Entrepot[];
  stockTotalEntrepotsKg: number;
  totalSacsEntrepots: number;
  transfertsEnCours: number;
  alertesCapacite: number;
}
interface Transfert {
  id: number; numeroTransfert: string; statut: string;
  poidsDepart_kg: string | null; poidsArrivee_kg: string | null; ecartKg: string | null;
  nombreSacs: number | null; nombreSacsArrivee: number | null;
  motifEcart: string | null; dateDepart: string | null; dateArrivee: string | null;
  datePrevue: string | null; typeVehicule: string | null; immatriculation: string | null;
  nomChauffeur: string | null; entrepotNom: string | null; entrepotId: number | null;
  zoneNom: string | null; delegueNom: string | null; deleguePrenoms: string | null; notes: string | null;
}
interface Mouvement {
  id: number;
  typeMouvement: "entree" | "sortie";
  motif: "livraison_membre" | "transfert_central" | "ajustement" | "perte";
  poidsKg: string;
  stockAvantKg: string;
  stockApresKg: string;
  livraisonId: number | null;
  transfertId: number | null;
  dateMouvement: string;
  notes: string | null;
  enregistreParNom: string | null;
}

const STATUT_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  planifie:  { label: "Planifié",   color: "bg-blue-100 text-blue-800",   icon: <Clock className="w-3 h-3" /> },
  en_cours:  { label: "En transit", color: "bg-amber-100 text-amber-800", icon: <Truck className="w-3 h-3" /> },
  arrive:    { label: "Arrivé",     color: "bg-purple-100 text-purple-800", icon: <Package className="w-3 h-3" /> },
  confirme:  { label: "Confirmé",   color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="w-3 h-3" /> },
  litige:    { label: "Litige",     color: "bg-red-100 text-red-800",     icon: <AlertTriangle className="w-3 h-3" /> },
};

function StatutBadge({ statut }: { statut: string }) {
  const s = STATUT_LABEL[statut] ?? { label: statut, color: "bg-gray-100 text-gray-800", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

function JaugeStock({ stock, capacite, seuil }: { stock: string; capacite: string | null; seuil: string | null }) {
  const p = pct(stock, capacite);
  const alerte = seuil && parseFloat(stock) > parseFloat(seuil);
  const color = alerte ? "bg-orange-500" : p > 80 ? "bg-red-500" : p > 50 ? "bg-amber-400" : "bg-green-500";
  if (!capacite) return <span className="text-sm text-gray-500">{kg(stock)}</span>;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span className="font-semibold">{kg(stock)}</span>
        <span>{p}% de {kg(capacite)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      {alerte && (
        <p className="text-xs text-orange-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Seuil d'alerte atteint
        </p>
      )}
    </div>
  );
}

interface DelegueListe {
  id: number;
  nom: string;
  prenoms: string | null;
  telephone: string | null;
  zoneNom: string | null;
}

export default function EntrepotsPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const peutGerer = usePermission("stocks", "creer_entrepot");
  const peutModifier = usePermission("stocks", "modifier_entrepot");
  const [onglet, setOnglet] = useState<"stocks" | "transferts">("stocks");
  const [filtreStatut, setFiltreStatut] = useState<"tous" | "confirme" | "litige" | "arrive">("tous");
  const [showArrivee, setShowArrivee] = useState<Transfert | null>(null);
  const [formArrivee, setFormArrivee] = useState({ poidsArrivee_kg: "", nombreSacsArrivee: "", motifEcart: "", notes: "" });
  const [showCreer, setShowCreer] = useState(false);
  const [formCreer, setFormCreer] = useState({
    delegueId: "", nom: "", zoneNom: "", zoneType: "village",
    capaciteMaxKg: "", seuilAlerteKg: "", capaciteSacs: "", adresse: "",
  });
  const [showEditer, setShowEditer] = useState(false);
  const [entrepotEdite, setEntrepotEdite] = useState<Entrepot | null>(null);
  const [formEditer, setFormEditer] = useState({
    nom: "", zoneNom: "", zoneType: "village",
    capaciteMaxKg: "", seuilAlerteKg: "", capaciteSacs: "", adresse: "",
  });
  const [showDetail, setShowDetail] = useState<Entrepot | null>(null);
  const [detailOnglet, setDetailOnglet] = useState<"mouvements" | "transferts">("mouvements");
  const [showAjustForm, setShowAjustForm] = useState(false);
  const [formAjust, setFormAjust] = useState({
    type: "entree" as "entree" | "sortie",
    motif: "ajustement" as "ajustement" | "perte",
    poidsKg: "",
    notes: "",
  });
  const [showTransfert, setShowTransfert] = useState<Entrepot | null>(null);
  const [formTransfert, setFormTransfert] = useState({
    poidsKg: "",
    typeVehicule: "",
    immatriculation: "",
    nomChauffeur: "",
    notes: "",
  });

  const { data: deleguesListe = [], isLoading: loadDelegues } = useQuery<DelegueListe[]>({
    queryKey: ["delegues-liste-entrepots"],
    queryFn: () => apiFetch("/entrepots/delegues-liste"),
    enabled: showCreer,
  });

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["entrepots-stats"],
    queryFn: () => apiFetch("/entrepots/stats"),
    refetchInterval: 60_000,
  });

  const { data: transferts = [], isLoading: loadTrans } = useQuery<Transfert[]>({
    queryKey: ["transferts"],
    queryFn: () => apiFetch("/transferts"),
    enabled: onglet === "transferts" || !!showDetail,
  });

  const mutArrivee = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/transferts/${id}/arrivee`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transferts"] });
      qc.invalidateQueries({ queryKey: ["entrepots-stats"] });
      setShowArrivee(null);
      toast({ title: "Réception confirmée" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const mutLitige = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/transferts/${id}/litige`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transferts"] });
      toast({ title: "Litige signalé" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const mutAjuster = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/entrepots/${id}/ajustement`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entrepot-mouvements", showDetail?.id] });
      qc.invalidateQueries({ queryKey: ["entrepots-stats"] });
      setShowAjustForm(false);
      setFormAjust({ type: "entree", motif: "ajustement", poidsKg: "", notes: "" });
      toast({ title: "Ajustement enregistré" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const { data: mouvements = [], isFetching: loadMouvements } = useQuery<Mouvement[]>({
    queryKey: ["entrepot-mouvements", showDetail?.id],
    queryFn: () => apiFetch(`/entrepots/${showDetail!.id}/mouvements?limit=50`),
    enabled: !!showDetail,
    staleTime: 30_000,
  });

  const mutCreer = useMutation({
    mutationFn: (body: object) => apiFetch("/entrepots", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entrepots-stats"] });
      setShowCreer(false);
      setFormCreer({ delegueId: "", nom: "", zoneNom: "", zoneType: "village", capaciteMaxKg: "", seuilAlerteKg: "", capaciteSacs: "", adresse: "" });
      toast({ title: "Entrepôt créé" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const mutEditer = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/entrepots/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entrepots-stats"] });
      setShowEditer(false);
      setEntrepotEdite(null);
      toast({ title: "Entrepôt mis à jour" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const mutTransfert = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/entrepots/${id}/transfert`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entrepots-stats"] });
      qc.invalidateQueries({ queryKey: ["transferts"] });
      setShowTransfert(null);
      setFormTransfert({ poidsKg: "", typeVehicule: "", immatriculation: "", nomChauffeur: "", notes: "" });
      toast({ title: "Transfert lancé", description: "Le stock est en transit vers le magasin central." });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  function ouvrirEditer(e: Entrepot) {
    setEntrepotEdite(e);
    setFormEditer({
      nom: e.nom,
      zoneNom: e.zoneNom ?? "",
      zoneType: e.zoneType ?? "village",
      capaciteMaxKg: e.capaciteMaxKg ?? "",
      seuilAlerteKg: e.seuilAlerteKg ?? "",
      capaciteSacs: e.capaciteSacs != null ? String(e.capaciteSacs) : "",
      adresse: e.adresse ?? "",
    });
    setShowEditer(true);
  }

  const entrepots = stats?.entrepots ?? [];
  const enCours = transferts.filter((t) => ["planifie", "en_cours"].includes(t.statut));
  const historiqueTous = transferts.filter((t) => ["arrive", "confirme", "litige"].includes(t.statut));
  const historique = filtreStatut === "tous" ? historiqueTous : historiqueTous.filter((t) => t.statut === filtreStatut);
  const comptesStatut = {
    confirme: historiqueTous.filter((t) => t.statut === "confirme").length,
    litige: historiqueTous.filter((t) => t.statut === "litige").length,
    arrive: historiqueTous.filter((t) => t.statut === "arrive").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-green-700" />
            Stocks
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Vue consolidée — entrepôts délégués &amp; transferts</p>
        </div>
        {peutGerer && (
          <button onClick={() => setShowCreer(true)}
            className="flex items-center gap-2 bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800">
            <Plus className="w-4 h-4" /> Nouvel entrepôt
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-5 h-5 text-green-700" />
            <span className="text-xs text-gray-400">Stock total entrepôts</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{kg(stats?.stockTotalEntrepotsKg ?? 0)}</p>
          {(stats?.totalSacsEntrepots ?? 0) > 0 && (
            <p className="text-xs text-gray-400 mt-1">{stats!.totalSacsEntrepots} sacs</p>
          )}
        </div>
        {[
          { label: "Entrepôts actifs", value: entrepots.filter(e => e.actif).length, icon: <Warehouse className="w-5 h-5 text-blue-600" />, color: "blue" },
          { label: "Transferts en cours", value: stats?.transfertsEnCours ?? 0, icon: <Truck className="w-5 h-5 text-amber-600" />, color: "amber" },
          { label: "Alertes capacité", value: stats?.alertesCapacite ?? 0, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, color: "red" },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">{k.icon}<span className="text-xs text-gray-400">{k.label}</span></div>
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: "stocks", label: "Entrepôts délégués" },
          { key: "transferts", label: `Transferts${stats?.transfertsEnCours ? ` (${stats.transfertsEnCours} en cours)` : ""}` },
        ].map((o) => (
          <button key={o.key} onClick={() => setOnglet(o.key as typeof onglet)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${onglet === o.key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Contenu onglet Stocks */}
      {onglet === "stocks" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse h-40" />
            ))
            : entrepots.length === 0
              ? (
                <div className="col-span-full text-center py-16 text-gray-400">
                  <Warehouse className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Aucun entrepôt délégué</p>
                  <p className="text-sm">Créez un entrepôt pour commencer le suivi des stocks.</p>
                </div>
              )
              : entrepots.map((e) => {
                const p = pct(e.stockActuelKg, e.capaciteMaxKg);
                const alerte = e.seuilAlerteKg && parseFloat(e.stockActuelKg) > parseFloat(e.seuilAlerteKg);
                return (
                  <div key={e.id} className={`bg-white rounded-xl border p-5 shadow-sm ${alerte ? "border-orange-300" : "border-gray-100"} ${!e.actif ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{e.nom}</h3>
                        {e.zoneNom && <p className="text-xs text-gray-500">{e.zoneNom} · {e.zoneType ?? ""}</p>}
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.actif ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {e.actif ? "Actif" : "Inactif"}
                        </span>
                        <button
                          onClick={() => { setShowDetail(e); setDetailOnglet("mouvements"); }}
                          title="Voir le détail"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {peutModifier && (
                          <button
                            onClick={() => ouvrirEditer(e)}
                            title="Modifier cet entrepôt"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-700 hover:bg-green-50 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mb-3">
                      <JaugeStock stock={e.stockActuelKg} capacite={e.capaciteMaxKg} seuil={e.seuilAlerteKg} />
                      {e.nombreSacsTotal != null && e.nombreSacsTotal > 0 && (
                        <p className="text-xs text-gray-500 mt-1.5">
                          <span className="font-semibold text-gray-700">{e.nombreSacsTotal}</span> sacs
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-50">
                      <span>
                        <span className="font-medium text-gray-700">
                          {e.delegueNom} {e.deleguePrenoms}
                        </span>
                      </span>
                      {e.stockMisAJourLe && <span>MàJ {fmtDate(e.stockMisAJourLe)}</span>}
                    </div>

                    {peutModifier && e.actif && parseFloat(e.stockActuelKg) > 0 && (
                      <button
                        onClick={() => {
                          setShowTransfert(e);
                          setFormTransfert({ poidsKg: e.stockActuelKg ? String(Math.floor(parseFloat(e.stockActuelKg))) : "", typeVehicule: "", immatriculation: "", nomChauffeur: "", notes: "" });
                        }}
                        className="mt-3 w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
                        <Truck className="w-3.5 h-3.5" />
                        Transférer vers le central
                        <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                      </button>
                    )}
                  </div>
                );
              })}
        </div>
      )}

      {/* Contenu onglet Transferts */}
      {onglet === "transferts" && (
        <div className="space-y-6">
          {/* En cours */}
          {enCours.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-500" /> Transferts en cours ({enCours.length})
              </h3>
              <div className="space-y-3">
                {enCours.map((t) => (
                  <div key={t.id} className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-semibold text-sm text-gray-800">{t.numeroTransfert}</span>
                          <StatutBadge statut={t.statut} />
                        </div>
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">{t.entrepotNom}</span>
                          {t.zoneNom && <span className="text-gray-400"> · {t.zoneNom}</span>}
                          <span className="text-gray-400"> — {t.delegueNom} {t.deleguePrenoms}</span>
                        </p>
                        {t.poidsDepart_kg && (
                          <p className="text-sm mt-1">
                            <span className="text-gray-500">Poids départ :</span>{" "}
                            <span className="font-semibold text-gray-800">{kg(t.poidsDepart_kg)}</span>
                          </p>
                        )}
                        {t.nomChauffeur && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {t.immatriculation} · {t.nomChauffeur}
                          </p>
                        )}
                      </div>
                      {t.statut === "en_cours" && (
                        <button
                          onClick={() => { setShowArrivee(t); setFormArrivee({ poidsArrivee_kg: "", nombreSacsArrivee: t.nombreSacs != null ? String(t.nombreSacs) : "", motifEcart: "", notes: "" }); }}
                          className="flex items-center gap-1.5 bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-800 whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Confirmer arrivée
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historique */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Historique
                {filtreStatut !== "tous" && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    ({historique.length} / {historiqueTous.length})
                  </span>
                )}
              </h3>
              {historiqueTous.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { key: "tous", label: "Tous", count: historiqueTous.length, color: "gray" },
                      { key: "confirme", label: "Confirmés", count: comptesStatut.confirme, color: "green" },
                      { key: "arrive", label: "Arrivés", count: comptesStatut.arrive, color: "blue" },
                      { key: "litige", label: "Litiges", count: comptesStatut.litige, color: "red" },
                    ] as const
                  ).map(({ key, label, count, color }) => {
                    if (key !== "tous" && count === 0) return null;
                    const actif = filtreStatut === key;
                    const colorMap = {
                      gray: actif ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
                      green: actif ? "bg-green-700 text-white border-green-700" : "bg-white text-green-700 border-green-200 hover:border-green-400",
                      blue: actif ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-600 border-blue-200 hover:border-blue-400",
                      red: actif ? "bg-red-600 text-white border-red-600" : "bg-white text-red-600 border-red-200 hover:border-red-400",
                    };
                    return (
                      <button
                        key={key}
                        onClick={() => setFiltreStatut(key)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${colorMap[color]}`}
                      >
                        {label}
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${actif ? "bg-white/20" : "bg-gray-100"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {loadTrans
              ? <div className="bg-white rounded-xl border h-32 animate-pulse" />
              : historiqueTous.length === 0 && enCours.length === 0
                ? (
                  <div className="text-center py-16 text-gray-400">
                    <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">Aucun transfert pour l'instant</p>
                  </div>
                )
                : historique.length === 0
                ? (
                  <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-100">
                    <p className="text-sm">Aucun transfert avec ce statut</p>
                    <button onClick={() => setFiltreStatut("tous")} className="mt-2 text-xs text-green-700 hover:underline">
                      Voir tous les transferts
                    </button>
                  </div>
                )
                : (
                  <div className="space-y-2">
                    {/* Affichage mobile : cartes */}
                    <div className="sm:hidden space-y-2">
                      {historique.map((t) => {
                        const ecart = t.ecartKg ? parseFloat(t.ecartKg) : null;
                        const dep = t.poidsDepart_kg ? parseFloat(t.poidsDepart_kg) : null;
                        const pctEc = dep && ecart ? Math.abs(ecart / dep * 100) : null;
                        const lienStock = `/stocks?tab=journal&q=${encodeURIComponent(t.numeroTransfert)}`;
                        return (
                          <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <span className="font-mono font-semibold text-sm text-gray-800 break-all">{t.numeroTransfert}</span>
                              <StatutBadge statut={t.statut} />
                            </div>
                            <p className="text-sm font-medium text-gray-800">{t.entrepotNom}</p>
                            <p className="text-xs text-gray-400 mb-3">{t.delegueNom} {t.deleguePrenoms}</p>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-gray-400 mb-0.5">Départ</p>
                                <p className="font-semibold text-gray-800">{t.poidsDepart_kg ? kg(t.poidsDepart_kg) : "—"}</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-gray-400 mb-0.5">Arrivée</p>
                                <p className="font-semibold text-gray-800">{t.poidsArrivee_kg ? kg(t.poidsArrivee_kg) : "—"}</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-gray-400 mb-0.5">Écart</p>
                                {ecart !== null ? (
                                  <p className={`font-semibold ${Math.abs(ecart) > 0 ? "text-red-600" : "text-green-600"}`}>
                                    {ecart > 0 ? "-" : "+"}{kg(Math.abs(ecart))}
                                    {pctEc !== null && <span className="block text-[10px]">({pctEc.toFixed(1)}%)</span>}
                                  </p>
                                ) : <p className="font-semibold text-gray-400">—</p>}
                              </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() => telechargerPdfTransfert(t.id, t.numeroTransfert).catch(() => {})}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-100 transition-colors"
                                title="Télécharger le bon de transfert"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                                PDF
                              </button>
                              {t.statut === "confirme" && (
                                <button
                                  onClick={() => setLocation(lienStock)}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Voir dans Stocks
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Affichage desktop : table */}
                    <div className="hidden sm:block bg-white rounded-xl border border-gray-100 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                          <tr>
                            <th className="px-4 py-3 text-left">N°</th>
                            <th className="px-4 py-3 text-left">Entrepôt / Délégué</th>
                            <th className="px-4 py-3 text-right">Départ</th>
                            <th className="px-4 py-3 text-right">Arrivée</th>
                            <th className="px-4 py-3 text-right">Écart</th>
                            <th className="px-4 py-3 text-center">Statut</th>
                            <th className="px-4 py-3 text-center hidden lg:table-cell">Stock central</th>
                            <th className="px-3 py-3 text-center">PDF</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {historique.map((t) => {
                            const ecart = t.ecartKg ? parseFloat(t.ecartKg) : null;
                            const dep = t.poidsDepart_kg ? parseFloat(t.poidsDepart_kg) : null;
                            const pctEc = dep && ecart ? Math.abs(ecart / dep * 100) : null;
                            const lienStock = `/stocks?tab=journal&q=${encodeURIComponent(t.numeroTransfert)}`;
                            return (
                              <tr key={t.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-mono font-medium text-gray-800">{t.numeroTransfert}</td>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-gray-800">{t.entrepotNom}</p>
                                  <p className="text-xs text-gray-400">{t.delegueNom} {t.deleguePrenoms}</p>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-700">{t.poidsDepart_kg ? kg(t.poidsDepart_kg) : "—"}</td>
                                <td className="px-4 py-3 text-right text-gray-700">{t.poidsArrivee_kg ? kg(t.poidsArrivee_kg) : "—"}</td>
                                <td className="px-4 py-3 text-right">
                                  {ecart !== null ? (
                                    <span className={`text-xs font-medium ${Math.abs(ecart) > 0 ? "text-red-600" : "text-green-600"}`}>
                                      {ecart > 0 ? "-" : "+"}{kg(Math.abs(ecart))}
                                      {pctEc !== null && ` (${pctEc.toFixed(1)}%)`}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <StatutBadge statut={t.statut} />
                                  {t.statut === "confirme" && (
                                    <button
                                      onClick={() => setLocation(lienStock)}
                                      className="mt-1.5 flex items-center justify-center gap-1 text-xs text-green-700 hover:text-green-900 hover:underline w-full"
                                      title="Voir l'entrée dans le stock central"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      Entrée créée
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center hidden lg:table-cell">
                                  {t.statut === "confirme" ? (
                                    <button
                                      onClick={() => setLocation(lienStock)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
                                      title="Voir le mouvement correspondant dans la page Stocks"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Voir dans Stocks
                                      <ArrowRight className="w-3 h-3" />
                                    </button>
                                  ) : t.statut === "litige" ? (
                                    <span className="text-xs text-gray-400 italic">Non créée (litige)</span>
                                  ) : (
                                    <span className="text-xs text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <button
                                    onClick={() => telechargerPdfTransfert(t.id, t.numeroTransfert).catch(() => {})}
                                    title="Télécharger le bon de transfert PDF"
                                    className="inline-flex items-center justify-center p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                  >
                                    <FileDown className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
          </div>
        </div>
      )}

      {/* Modal transfert vers le central */}
      {showTransfert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-green-700" />
                  Transférer vers le central
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className="font-medium text-gray-700">{showTransfert.nom}</span>
                  {showTransfert.zoneNom && <span> · {showTransfert.zoneNom}</span>}
                  {" — "}Stock disponible : <strong className="text-gray-800">{kg(showTransfert.stockActuelKg)}</strong>
                </p>
              </div>
              <button onClick={() => setShowTransfert(null)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 text-xl font-light leading-none">✕</button>
            </div>

            <div className="space-y-3">
              {/* Poids */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Poids à transférer (kg) *
                </label>
                <input
                  type="number" min="1" step="1"
                  max={parseFloat(showTransfert.stockActuelKg)}
                  placeholder={`max ${Math.floor(parseFloat(showTransfert.stockActuelKg))} kg`}
                  value={formTransfert.poidsKg}
                  onChange={(e) => setFormTransfert(f => ({ ...f, poidsKg: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
                {formTransfert.poidsKg && (() => {
                  const max = parseFloat(showTransfert.stockActuelKg);
                  const v = parseFloat(formTransfert.poidsKg);
                  if (v > max) return <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Dépasse le stock disponible ({kg(max)})</p>;
                  if (v <= 0) return <p className="text-xs text-red-600 mt-1">Doit être supérieur à 0</p>;
                  const reste = max - v;
                  return <p className="text-xs text-gray-500 mt-1">Stock restant après transfert : <span className="font-medium text-gray-700">{kg(reste)}</span></p>;
                })()}
              </div>

              {/* Infos véhicule */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Immatriculation</label>
                  <input type="text" placeholder="ex: AA 1234 CI"
                    value={formTransfert.immatriculation}
                    onChange={(e) => setFormTransfert(f => ({ ...f, immatriculation: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type de véhicule</label>
                  <select value={formTransfert.typeVehicule}
                    onChange={(e) => setFormTransfert(f => ({ ...f, typeVehicule: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
                    <option value="">— Non précisé —</option>
                    <option value="camion">Camion</option>
                    <option value="pickup">Pick-up</option>
                    <option value="moto">Moto</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du chauffeur</label>
                <input type="text" placeholder="ex: Kouadio Paul"
                  value={formTransfert.nomChauffeur}
                  onChange={(e) => setFormTransfert(f => ({ ...f, nomChauffeur: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optionnel)</label>
                <textarea rows={2} placeholder="Remarques, instructions…"
                  value={formTransfert.notes}
                  onChange={(e) => setFormTransfert(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 resize-none" />
              </div>

              {/* Résumé */}
              {formTransfert.poidsKg && parseFloat(formTransfert.poidsKg) > 0 && parseFloat(formTransfert.poidsKg) <= parseFloat(showTransfert.stockActuelKg) && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-3 text-sm">
                  <div className="shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Truck className="w-4 h-4 text-green-700" />
                  </div>
                  <div>
                    <p className="font-medium text-green-800">{kg(formTransfert.poidsKg)} en transit</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      {showTransfert.nom} <ArrowRight className="w-3 h-3 inline" /> Magasin central
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowTransfert(null)}
                className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button
                disabled={
                  !formTransfert.poidsKg ||
                  parseFloat(formTransfert.poidsKg) <= 0 ||
                  parseFloat(formTransfert.poidsKg) > parseFloat(showTransfert.stockActuelKg) ||
                  mutTransfert.isPending
                }
                onClick={() => mutTransfert.mutate({
                  id: showTransfert.id,
                  body: {
                    poidsKg: parseFloat(formTransfert.poidsKg),
                    typeVehicule: formTransfert.typeVehicule || undefined,
                    immatriculation: formTransfert.immatriculation || undefined,
                    nomChauffeur: formTransfert.nomChauffeur || undefined,
                    notes: formTransfert.notes || undefined,
                  },
                })}
                className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50 flex items-center justify-center gap-2">
                {mutTransfert.isPending
                  ? "Lancement…"
                  : <><Truck className="w-4 h-4" /> Lancer le transfert</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation arrivée */}
      {showArrivee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Confirmer la réception</h2>
            <p className="text-sm text-gray-500 mb-4">
              Transfert <span className="font-mono font-semibold">{showArrivee.numeroTransfert}</span>
              {" — "}Poids départ : <strong>{kg(showArrivee.poidsDepart_kg)}</strong>
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Poids reçu (kg) *</label>
                  <input type="number" step="0.01" placeholder="0.00"
                    value={formArrivee.poidsArrivee_kg}
                    onChange={(e) => setFormArrivee(f => ({ ...f, poidsArrivee_kg: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de sacs reçus
                    {showArrivee.nombreSacs != null && (
                      <span className="text-gray-400 font-normal"> (expédié : {showArrivee.nombreSacs})</span>
                    )}
                  </label>
                  <input type="number" min="0" step="1" placeholder="0"
                    value={formArrivee.nombreSacsArrivee}
                    onChange={(e) => setFormArrivee(f => ({ ...f, nombreSacsArrivee: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                </div>
              </div>
              {formArrivee.poidsArrivee_kg && showArrivee.poidsDepart_kg && (() => {
                const dep = parseFloat(showArrivee.poidsDepart_kg ?? "0");
                const arr = parseFloat(formArrivee.poidsArrivee_kg);
                const ec = dep - arr;
                const p = dep ? Math.abs(ec / dep * 100) : 0;
                const isLitige = p > 0.5;
                const sacsDep = showArrivee.nombreSacs;
                const sacsArr = formArrivee.nombreSacsArrivee ? parseInt(formArrivee.nombreSacsArrivee) : null;
                const ecartSacs = sacsDep != null && sacsArr != null ? sacsDep - sacsArr : null;
                return (
                  <div className={`rounded-lg px-3 py-2 text-xs flex flex-col gap-0.5 ${isLitige ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    <p className="flex items-center gap-1 font-medium">
                      {isLitige ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      Écart poids : {ec.toFixed(0)} kg ({p.toFixed(1)}%)
                      {isLitige ? " → Litige automatique" : " → OK"}
                    </p>
                    {ecartSacs !== null && ecartSacs !== 0 && (
                      <p className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Écart sacs : {ecartSacs > 0 ? `-${ecartSacs}` : `+${Math.abs(ecartSacs)}`} sac{Math.abs(ecartSacs) > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                );
              })()}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motif d'écart</label>
                <select value={formArrivee.motifEcart}
                  onChange={(e) => setFormArrivee(f => ({ ...f, motifEcart: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500">
                  <option value="">— Aucun —</option>
                  <option value="evaporation">Évaporation</option>
                  <option value="perte">Perte</option>
                  <option value="erreur_pesee">Erreur de pesée</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={2} value={formArrivee.notes}
                  onChange={(e) => setFormArrivee(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowArrivee(null)}
                className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button
                disabled={!formArrivee.poidsArrivee_kg || mutArrivee.isPending}
                onClick={() => mutArrivee.mutate({
                  id: showArrivee.id,
                  body: {
                    poidsArrivee_kg: parseFloat(formArrivee.poidsArrivee_kg),
                    nombreSacsArrivee: formArrivee.nombreSacsArrivee ? parseInt(formArrivee.nombreSacsArrivee) : undefined,
                    motifEcart: formArrivee.motifEcart || undefined,
                    notes: formArrivee.notes || undefined,
                  },
                })}
                className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50">
                {mutArrivee.isPending ? "En cours…" : "Confirmer la réception"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer détail entrepôt */}
      {showDetail && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowDetail(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white z-50 shadow-2xl flex flex-col">
            {/* En-tête */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h2 className="text-lg font-bold text-gray-900 truncate">{showDetail.nom}</h2>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${showDetail.actif ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {showDetail.actif ? "Actif" : "Inactif"}
                    </span>
                  </div>
                  {showDetail.zoneNom && (
                    <p className="text-sm text-gray-500">{showDetail.zoneNom} · {showDetail.zoneType}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-0.5">
                    Délégué : <span className="font-medium text-gray-700">{showDetail.delegueNom} {showDetail.deleguePrenoms}</span>
                  </p>
                </div>
                <button onClick={() => setShowDetail(null)} className="shrink-0 p-2 rounded-lg text-gray-400 hover:bg-gray-100 text-xl font-light leading-none">✕</button>
              </div>
              {/* Mini jauge */}
              <div className="mt-3">
                <JaugeStock stock={showDetail.stockActuelKg} capacite={showDetail.capaciteMaxKg} seuil={showDetail.seuilAlerteKg} />
              </div>
              <div className="flex gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                <span>Stock : <span className="font-semibold text-gray-800">{kg(showDetail.stockActuelKg)}</span></span>
                {showDetail.capaciteMaxKg && <span>Capacité : <span className="font-semibold text-gray-800">{kg(showDetail.capaciteMaxKg)}</span></span>}
                {showDetail.capaciteSacs != null && <span>Capacité sacs : <span className="font-semibold text-gray-800">{showDetail.capaciteSacs} sacs</span></span>}
                {showDetail.nombreSacsTotal != null && showDetail.nombreSacsTotal > 0 && (
                  <span>Sacs stockés : <span className="font-semibold text-gray-800">{showDetail.nombreSacsTotal}</span></span>
                )}
                {showDetail.adresse && <span className="truncate">{showDetail.adresse}</span>}
              </div>
            </div>

            {/* Onglets */}
            {(() => {
              const pendingCount = transferts.filter(
                (t) => t.entrepotId === showDetail.id && t.statut === "en_cours"
              ).length;
              return (
                <div className="flex border-b border-gray-100 px-6">
                  {(["mouvements", "transferts"] as const).map((tab) => (
                    <button key={tab} onClick={() => setDetailOnglet(tab)}
                      className={`py-3 px-1 mr-5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${detailOnglet === tab ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                      {tab === "mouvements" ? "Mouvements de stock" : "Transferts"}
                      {tab === "transferts" && pendingCount > 0 && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Corps scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4">

              {detailOnglet === "mouvements" && (
                <>
                {/* ── Bouton / formulaire ajustement ── */}
                {peutModifier && (
                  <div className="mb-4">
                    <button
                      onClick={() => setShowAjustForm((v) => !v)}
                      className="flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 px-3 py-2 rounded-lg w-full transition-colors">
                      <SlidersHorizontal className="w-4 h-4" />
                      Ajustement manuel de stock
                      {showAjustForm ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                    </button>

                    {showAjustForm && (
                      <div className="mt-2 border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                        {/* Type entrée / sortie */}
                        <div className="flex gap-2">
                          {(["entree", "sortie"] as const).map((t) => (
                            <button key={t} onClick={() => setFormAjust((f) => ({ ...f, type: t }))}
                              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                formAjust.type === t
                                  ? t === "entree" ? "bg-green-600 text-white border-green-600" : "bg-red-500 text-white border-red-500"
                                  : "border-gray-200 text-gray-600 hover:bg-white"
                              }`}>
                              {t === "entree" ? "↑ Entrée" : "↓ Sortie"}
                            </button>
                          ))}
                        </div>

                        {/* Motif */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Motif</label>
                          <select value={formAjust.motif}
                            onChange={(e) => setFormAjust((f) => ({ ...f, motif: e.target.value as "ajustement" | "perte" }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 bg-white">
                            <option value="ajustement">Ajustement (correction inventaire)</option>
                            <option value="perte">Perte (avarie, vol…)</option>
                          </select>
                        </div>

                        {/* Poids */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Poids (kg) *</label>
                          <input type="number" min="0.1" step="0.1" placeholder="ex: 250"
                            value={formAjust.poidsKg}
                            onChange={(e) => setFormAjust((f) => ({ ...f, poidsKg: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 bg-white" />
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optionnel)</label>
                          <input type="text" placeholder="Raison, contexte…"
                            value={formAjust.notes}
                            onChange={(e) => setFormAjust((f) => ({ ...f, notes: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 bg-white" />
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button onClick={() => { setShowAjustForm(false); setFormAjust({ type: "entree", motif: "ajustement", poidsKg: "", notes: "" }); }}
                            className="flex-1 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-white">
                            Annuler
                          </button>
                          <button
                            disabled={!formAjust.poidsKg || Number(formAjust.poidsKg) <= 0 || mutAjuster.isPending}
                            onClick={() => mutAjuster.mutate({
                              id: showDetail!.id,
                              body: {
                                type: formAjust.type,
                                motif: formAjust.motif,
                                poidsKg: parseFloat(formAjust.poidsKg),
                                notes: formAjust.notes || undefined,
                              },
                            })}
                            className={`flex-1 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors ${
                              formAjust.type === "entree" ? "bg-green-600 hover:bg-green-700" : "bg-red-500 hover:bg-red-600"
                            }`}>
                            {mutAjuster.isPending ? "Enregistrement…" : `Confirmer ${formAjust.type === "entree" ? "l'entrée" : "la sortie"}`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Liste des mouvements ── */}
                {loadMouvements ? (
                  <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Chargement…</div>
                ) : mouvements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-2">
                    <BarChart3 className="w-8 h-8 opacity-30" />
                    <p>Aucun mouvement enregistré</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mouvements.map((m) => {
                      const isEntree = m.typeMouvement === "entree";
                      const MOTIF: Record<string, string> = {
                        livraison_membre: "Livraison membre",
                        transfert_central: "Transfert central",
                        ajustement: "Ajustement",
                        perte: "Perte",
                      };
                      return (
                        <div key={m.id} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${isEntree ? "bg-green-100" : "bg-red-100"}`}>
                            {isEntree
                              ? <TrendingUp className="w-4 h-4 text-green-700" />
                              : <TrendingDown className="w-4 h-4 text-red-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm font-semibold ${isEntree ? "text-green-700" : "text-red-600"}`}>
                                {isEntree ? "+" : "−"}{kg(m.poidsKg)}
                              </span>
                              <span className="text-xs text-gray-400 shrink-0">{fmtDate(m.dateMouvement)}</span>
                            </div>
                            <p className="text-xs text-gray-600 mt-0.5">{MOTIF[m.motif] ?? m.motif}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {kg(m.stockAvantKg)} → <span className="font-medium text-gray-600">{kg(m.stockApresKg)}</span>
                              {m.enregistreParNom && <> · {m.enregistreParNom}</>}
                            </p>
                            {m.notes && <p className="text-xs text-gray-400 italic mt-0.5">{m.notes}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
                }
                </>
              )}

              {detailOnglet === "transferts" && (() => {
                const trEntrepot = transferts.filter((t) => t.entrepotId === showDetail.id);
                const enCoursDrawer = trEntrepot.filter((t) => t.statut === "en_cours");
                return trEntrepot.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-2">
                    <Truck className="w-8 h-8 opacity-30" />
                    <p>Aucun transfert pour cet entrepôt</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Bandeau d'alerte si transfert en attente de confirmation */}
                    {enCoursDrawer.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-amber-800 mb-1">
                        <Truck className="w-3.5 h-3.5 shrink-0" />
                        <span>{enCoursDrawer.length} transfert{enCoursDrawer.length > 1 ? "s" : ""} en transit — en attente de confirmation d'arrivée</span>
                      </div>
                    )}
                    {trEntrepot.map((t) => {
                      const s = STATUT_LABEL[t.statut];
                      return (
                        <div key={t.id} className={`rounded-xl p-3 ${t.statut === "en_cours" ? "bg-amber-50 border border-amber-100" : "bg-gray-50"}`}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-semibold text-gray-800">{t.numeroTransfert}</span>
                            {s && (
                              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>
                                {s.icon} {s.label}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                            {t.poidsDepart_kg && <span>Départ : <span className="font-medium text-gray-700">{kg(t.poidsDepart_kg)}</span></span>}
                            {t.poidsArrivee_kg && <span>Arrivée : <span className="font-medium text-gray-700">{kg(t.poidsArrivee_kg)}</span></span>}
                            {t.ecartKg && parseFloat(t.ecartKg) !== 0 && (
                              <span className="text-orange-600 font-medium">Écart : {kg(t.ecartKg)}</span>
                            )}
                          </div>
                          {t.nomChauffeur && <p className="text-xs text-gray-400 mt-0.5">Chauffeur : {t.nomChauffeur} {t.immatriculation ? `· ${t.immatriculation}` : ""}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">{fmtDate(t.dateDepart ?? t.datePrevue)}</p>
                          {t.statut === "en_cours" && (
                            <button
                              onClick={() => {
                                setShowArrivee(t);
                                setFormArrivee({ poidsArrivee_kg: "", nombreSacsArrivee: t.nombreSacs != null ? String(t.nombreSacs) : "", motifEcart: "", notes: "" });
                              }}
                              className="mt-2 w-full flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Confirmer l'arrivée au central
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

            </div>
          </div>
        </>
      )}

      {/* Modal éditer entrepôt */}
      {showEditer && entrepotEdite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Modifier l'entrepôt</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Délégué : <span className="font-medium text-gray-700">{entrepotEdite.delegueNom} {entrepotEdite.deleguePrenoms}</span>
                </p>
              </div>
              {/* Toggle actif / inactif */}
              <button
                onClick={() => mutEditer.mutate({ id: entrepotEdite.id, body: { actif: !entrepotEdite.actif } })}
                disabled={mutEditer.isPending}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                  entrepotEdite.actif
                    ? "border-red-200 text-red-600 hover:bg-red-50"
                    : "border-green-200 text-green-700 hover:bg-green-50"
                }`}>
                {entrepotEdite.actif
                  ? <><PowerOff className="w-3.5 h-3.5" /> Désactiver</>
                  : <><Power className="w-3.5 h-3.5" /> Réactiver</>}
              </button>
            </div>

            <div className="space-y-3">
              {/* Nom */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'entrepôt *</label>
                <input type="text" placeholder="ex: Point collecte Broukro"
                  value={formEditer.nom}
                  onChange={(e) => setFormEditer(f => ({ ...f, nom: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>

              {/* Zone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zone / Village</label>
                <input type="text" placeholder="ex: Broukro"
                  value={formEditer.zoneNom}
                  onChange={(e) => setFormEditer(f => ({ ...f, zoneNom: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>

              {/* Type zone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de zone</label>
                <select value={formEditer.zoneType}
                  onChange={(e) => setFormEditer(f => ({ ...f, zoneType: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
                  <option value="village">Village</option>
                  <option value="section">Section</option>
                  <option value="groupement">Groupement</option>
                </select>
              </div>

              {/* Capacité & seuil */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacité max (kg)</label>
                  <input type="number" placeholder="ex: 15000"
                    value={formEditer.capaciteMaxKg}
                    onChange={(e) => setFormEditer(f => ({ ...f, capaciteMaxKg: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seuil d'alerte (kg)</label>
                  <input type="number" placeholder="ex: 12000"
                    value={formEditer.seuilAlerteKg}
                    onChange={(e) => setFormEditer(f => ({ ...f, seuilAlerteKg: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                </div>
              </div>

              {/* Capacité en sacs */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacité (nombre de sacs)</label>
                <input type="number" min="0" placeholder="ex: 500"
                  value={formEditer.capaciteSacs}
                  onChange={(e) => setFormEditer(f => ({ ...f, capaciteSacs: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>

              {/* Adresse */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                <input type="text" placeholder="Adresse physique de l'entrepôt"
                  value={formEditer.adresse}
                  onChange={(e) => setFormEditer(f => ({ ...f, adresse: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowEditer(false); setEntrepotEdite(null); }}
                className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button
                disabled={!formEditer.nom || mutEditer.isPending}
                onClick={() => mutEditer.mutate({
                  id: entrepotEdite.id,
                  body: {
                    nom: formEditer.nom,
                    zoneNom: formEditer.zoneNom || undefined,
                    zoneType: formEditer.zoneType || undefined,
                    capaciteMaxKg: formEditer.capaciteMaxKg ? parseFloat(formEditer.capaciteMaxKg) : undefined,
                    seuilAlerteKg: formEditer.seuilAlerteKg ? parseFloat(formEditer.seuilAlerteKg) : undefined,
                    capaciteSacs: formEditer.capaciteSacs ? parseInt(formEditer.capaciteSacs) : undefined,
                    adresse: formEditer.adresse || undefined,
                  },
                })}
                className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50">
                {mutEditer.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal créer entrepôt */}
      {showCreer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Nouvel entrepôt délégué</h2>
            <div className="space-y-3">
              {/* Dropdown délégué */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Délégué de localité *</label>
                {loadDelegues ? (
                  <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50 animate-pulse">
                    Chargement des délégués…
                  </div>
                ) : deleguesListe.length === 0 ? (
                  <div className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-600 bg-orange-50">
                    Aucun délégué actif trouvé dans cette coopérative.
                  </div>
                ) : (
                  <select
                    value={formCreer.delegueId}
                    onChange={(e) => {
                      const d = deleguesListe.find(x => String(x.id) === e.target.value);
                      setFormCreer(f => ({
                        ...f,
                        delegueId: e.target.value,
                        zoneNom: f.zoneNom || (d?.zoneNom ?? ""),
                      }));
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
                    <option value="">— Sélectionner un délégué —</option>
                    {deleguesListe.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.nom} {d.prenoms ?? ""}
                        {d.zoneNom ? ` — ${d.zoneNom}` : ""}
                        {d.telephone ? ` (${d.telephone})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Nom entrepôt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'entrepôt *</label>
                <input type="text" placeholder="ex: Point collecte Broukro"
                  value={formCreer.nom}
                  onChange={(e) => setFormCreer(f => ({ ...f, nom: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>

              {/* Zone / Village */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zone / Village</label>
                <input type="text" placeholder="ex: Broukro"
                  value={formCreer.zoneNom}
                  onChange={(e) => setFormCreer(f => ({ ...f, zoneNom: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>

              {/* Type de zone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de zone</label>
                <select value={formCreer.zoneType}
                  onChange={(e) => setFormCreer(f => ({ ...f, zoneType: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
                  <option value="village">Village</option>
                  <option value="section">Section</option>
                  <option value="groupement">Groupement</option>
                </select>
              </div>

              {/* Capacité & seuil */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacité max (kg)</label>
                  <input type="number" placeholder="ex: 15000"
                    value={formCreer.capaciteMaxKg}
                    onChange={(e) => setFormCreer(f => ({ ...f, capaciteMaxKg: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seuil d'alerte (kg)</label>
                  <input type="number" placeholder="ex: 12000"
                    value={formCreer.seuilAlerteKg}
                    onChange={(e) => setFormCreer(f => ({ ...f, seuilAlerteKg: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                </div>
              </div>

              {/* Capacité en sacs */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacité (nombre de sacs)</label>
                <input type="number" placeholder="ex: 500"
                  value={formCreer.capaciteSacs}
                  onChange={(e) => setFormCreer(f => ({ ...f, capaciteSacs: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>

              {/* Adresse */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                <input type="text" placeholder="Adresse physique de l'entrepôt"
                  value={formCreer.adresse}
                  onChange={(e) => setFormCreer(f => ({ ...f, adresse: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreer(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button
                disabled={!formCreer.delegueId || !formCreer.nom || mutCreer.isPending}
                onClick={() => mutCreer.mutate({
                  delegueId: parseInt(formCreer.delegueId),
                  nom: formCreer.nom,
                  zoneNom: formCreer.zoneNom || undefined,
                  zoneType: formCreer.zoneType || undefined,
                  capaciteMaxKg: formCreer.capaciteMaxKg ? parseFloat(formCreer.capaciteMaxKg) : undefined,
                  seuilAlerteKg: formCreer.seuilAlerteKg ? parseFloat(formCreer.seuilAlerteKg) : undefined,
                  capaciteSacs: formCreer.capaciteSacs ? parseInt(formCreer.capaciteSacs) : undefined,
                  adresse: formCreer.adresse || undefined,
                })}
                className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50">
                {mutCreer.isPending ? "Création…" : "Créer l'entrepôt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

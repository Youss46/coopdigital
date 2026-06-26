import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/usePermission";
import {
  useGetVentes,
  useGetExportateurs,
  useCreateVente,
  useEncaisserVente,
  getGetVentesQueryKey,
  getGetExportateursQueryKey,
} from "@workspace/api-client-react";
import { ShoppingCart, PlusCircle, Banknote, Package, Clock, AlertCircle, CheckCircle2, ChevronDown, Search } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface LotDisponible {
  id: number;
  qrCodeLot: string;
  statut: string;
  poidsTotalKg: string;
  entrepot: string | null;
  dateCreation: string;
  nbLivraisons?: number;
}

function formaterFCFA(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}
function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUT_COLORS: Record<string, string> = {
  en_attente:            "bg-yellow-100 text-yellow-800",
  partiel:               "bg-blue-100 text-blue-800",
  regle:                 "bg-green-100 text-green-800",
  en_retard:             "bg-red-100 text-red-800",
  refoule:               "bg-orange-100 text-orange-800",
  partiellement_refoule: "bg-orange-50 text-orange-700",
};
const STATUT_LABELS: Record<string, string> = {
  en_attente:            "En attente",
  partiel:               "Partiel",
  regle:                 "Réglé ✓",
  en_retard:             "En retard",
  refoule:               "Refoulé",
  partiellement_refoule: "Part. refoulé",
};

const STATUT_ICON: Record<string, React.ReactNode> = {
  en_attente: <Clock size={12} />,
  partiel:    <Banknote size={12} />,
  regle:      <CheckCircle2 size={12} />,
  en_retard:  <AlertCircle size={12} />,
};

const VENTE_INIT = {
  lotId:                  "",
  exportateurId:          "",
  poidsKg:                "",
  prixUnitaireFcfa:       "",
  nombreSacs:             "",
  dateVente:              new Date().toISOString().split("T")[0]!,
  dateEcheanceReglement:  "",
};

const VENTE_FOURN_INIT = {
  fournisseurId:          "",
  exportateurId:          "",
  prixUnitaireFcfa:       "",
  nombreSacs:             "",
  dateVente:              new Date().toISOString().split("T")[0]!,
  dateEcheanceReglement:  "",
};

interface StockFournisseur {
  id: number;
  nom: string;
  prenoms: string | null;
  type_fournisseur: string;
  poids_disponible_kg: string;
  nb_livraisons: number;
}

interface LivraisonDispo {
  id: number;
  dateLivraison: string;
  poidsKg: string;
}

export default function VentesPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const peutCreer   = usePermission("exportateurs", "creer");
  const peutEncaisser = usePermission("creances", "enregistrer_encaissement");

  const [filtreStatut, setFiltreStatut]       = useState("");
  const [filtreExport, setFiltreExport]       = useState("");
  const [recherche, setRecherche]             = useState("");
  const [modalVente, setModalVente]           = useState(false);
  const [modalEncaisse, setModalEncaisse]     = useState<number | null>(null);
  const [montantEncaisse, setMontantEncaisse] = useState("");
  const [form, setForm]                       = useState(VENTE_INIT);
  const [sourceStock, setSourceStock]         = useState<"lots" | "fournisseur">("lots");
  const [formFourn, setFormFourn]             = useState(VENTE_FOURN_INIT);
  const [submittingFourn, setSubmittingFourn] = useState(false);
  const [selectedLivIds, setSelectedLivIds]   = useState<Set<number>>(new Set());

  const { data: ventes = [], isLoading } = useGetVentes({}, {
    query: { queryKey: getGetVentesQueryKey({}) },
  });
  const { data: exportateurs = [] } = useGetExportateurs();
  const { data: lotsEnStock = [] } = useQuery<LotDisponible[]>({
    queryKey: ["ventes-lots-stock"],
    queryFn:  () => apiFetch("/api/lots?statut=en_stock", token),
    enabled:  modalVente && sourceStock === "lots",
  });

  const { data: stockFournisseurs = [] } = useQuery<StockFournisseur[]>({
    queryKey: ["ventes-stock-fournisseurs"],
    queryFn:  () => apiFetch("/api/fournisseurs/stock-disponible", token),
    enabled:  modalVente && sourceStock === "fournisseur",
  });

  const { data: livraisonsDisposFourn = [] } = useQuery<LivraisonDispo[]>({
    queryKey: ["livraisons-dispos-fourn", formFourn.fournisseurId],
    queryFn:  () => apiFetch(`/api/fournisseurs/${formFourn.fournisseurId}/livraisons-disponibles`, token),
    enabled:  modalVente && sourceStock === "fournisseur" && !!formFourn.fournisseurId,
  });
  const { data: prixActuel } = useQuery<{ prixVenteExportFcfa: string } | null>({
    queryKey: ["prix-actuel"],
    queryFn:  () => apiFetch("/api/prix/actuel", token),
    staleTime: 5 * 60 * 1000,
  });

  const mutVente = useCreateVente({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVentesQueryKey({}) });
        qc.invalidateQueries({ queryKey: getGetExportateursQueryKey() });
        qc.invalidateQueries({ queryKey: ["ventes-lots-stock"] });
        setModalVente(false);
        setForm(VENTE_INIT);
        toast({ title: "Vente enregistrée", description: "Le lot est marqué comme vendu." });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Erreur interne";
        toast({ title: "Erreur", description: msg, variant: "destructive" });
      },
    },
  });

  const mutEncaisse = useEncaisserVente({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVentesQueryKey({}) });
        setModalEncaisse(null);
        setMontantEncaisse("");
        toast({ title: "Encaissement enregistré" });
      },
      onError: () => {
        toast({ title: "Erreur encaissement", variant: "destructive" });
      },
    },
  });

  const lotSelectionne = lotsEnStock.find(l => String(l.id) === form.lotId);

  function ouvrirModalVente() {
    const prixExport = prixActuel?.prixVenteExportFcfa
      ? String(Math.round(parseFloat(prixActuel.prixVenteExportFcfa)))
      : "";
    setForm({ ...VENTE_INIT, prixUnitaireFcfa: prixExport });
    setFormFourn({ ...VENTE_FOURN_INIT, prixUnitaireFcfa: prixExport });
    setSourceStock("lots");
    setSelectedLivIds(new Set());
    setModalVente(true);
  }

  function handleFournisseurChange(fournisseurId: string) {
    setFormFourn(f => ({ ...f, fournisseurId }));
    setSelectedLivIds(new Set());
  }

  function toggleLivraison(id: number) {
    setSelectedLivIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleToutesLivraisons() {
    if (selectedLivIds.size === livraisonsDisposFourn.length) {
      setSelectedLivIds(new Set());
    } else {
      setSelectedLivIds(new Set(livraisonsDisposFourn.map(l => l.id)));
    }
  }

  const poidsSelectionne = livraisonsDisposFourn
    .filter(l => selectedLivIds.has(l.id))
    .reduce((s, l) => s + parseFloat(l.poidsKg), 0);

  async function handleSubmitVenteFournisseur() {
    if (!formFourn.fournisseurId) { toast({ title: "Fournisseur requis", variant: "destructive" }); return; }
    if (selectedLivIds.size === 0) { toast({ title: "Sélectionnez au moins une livraison", variant: "destructive" }); return; }
    if (!formFourn.exportateurId) { toast({ title: "Exportateur requis", variant: "destructive" }); return; }
    if (!formFourn.prixUnitaireFcfa || parseInt(formFourn.prixUnitaireFcfa) <= 0) { toast({ title: "Prix unitaire requis", variant: "destructive" }); return; }
    if (!formFourn.dateVente) { toast({ title: "Date de vente requise", variant: "destructive" }); return; }

    setSubmittingFourn(true);
    try {
      const BASE = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${BASE}/api/fournisseurs/vente`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          fournisseurId:         parseInt(formFourn.fournisseurId),
          exportateurId:         parseInt(formFourn.exportateurId),
          livraisonIds:          Array.from(selectedLivIds),
          prixUnitaireFcfa:      parseInt(formFourn.prixUnitaireFcfa),
          nombreSacs:            formFourn.nombreSacs ? parseInt(formFourn.nombreSacs) : undefined,
          dateVente:             formFourn.dateVente,
          dateEcheanceReglement: formFourn.dateEcheanceReglement || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { erreur?: string };
        throw new Error(errBody.erreur ?? `HTTP ${res.status}`);
      }
      qc.invalidateQueries({ queryKey: getGetVentesQueryKey({}) });
      qc.invalidateQueries({ queryKey: ["ventes-stock-fournisseurs"] });
      qc.invalidateQueries({ queryKey: ["livraisons-dispos-fourn", formFourn.fournisseurId] });
      setModalVente(false);
      setFormFourn(VENTE_FOURN_INIT);
      setSelectedLivIds(new Set());
      toast({ title: "Vente enregistrée", description: "Le lot fournisseur est créé et marqué comme vendu." });
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur interne", variant: "destructive" });
    } finally {
      setSubmittingFourn(false);
    }
  }

  function handleLotChange(lotId: string) {
    const lot = lotsEnStock.find(l => String(l.id) === lotId);
    setForm(f => ({
      ...f,
      lotId,
      poidsKg: lot ? parseFloat(lot.poidsTotalKg).toFixed(2) : f.poidsKg,
    }));
  }

  function handleSubmitVente() {
    if (!form.exportateurId) { toast({ title: "Exportateur requis", variant: "destructive" }); return; }
    if (!form.poidsKg || parseFloat(form.poidsKg) <= 0) { toast({ title: "Poids requis", variant: "destructive" }); return; }
    if (!form.prixUnitaireFcfa || parseInt(form.prixUnitaireFcfa) <= 0) { toast({ title: "Prix unitaire requis", variant: "destructive" }); return; }
    if (!form.dateVente) { toast({ title: "Date de vente requise", variant: "destructive" }); return; }

    mutVente.mutate({
      data: {
        exportateurId:         parseInt(form.exportateurId),
        lotId:                 form.lotId ? parseInt(form.lotId) : undefined,
        poidsKg:               parseFloat(form.poidsKg),
        prixUnitaireFcfa:      parseInt(form.prixUnitaireFcfa),
        nombreSacs:            form.nombreSacs ? parseInt(form.nombreSacs) : undefined,
        dateVente:             form.dateVente,
        dateEcheanceReglement: form.dateEcheanceReglement || undefined,
      } as Parameters<typeof mutVente.mutate>[0]["data"],
    });
  }

  // Filtrage local
  const ventesFiltered = (ventes as {
    id: number; exportateurId: number; exportateurNom: string | null; lotId: number | null;
    poidsKg: string; prixUnitaireFcfa: number; montantTotalFcfa: number;
    dateVente: string; dateEcheanceReglement: string | null;
    montantRecuFcfa: number; soldeDuFcfa: number; statut: string;
  }[]).filter(v => {
    if (filtreStatut && v.statut !== filtreStatut) return false;
    if (filtreExport && String(v.exportateurId) !== filtreExport) return false;
    if (recherche) {
      const q = recherche.toLowerCase();
      return (v.exportateurNom ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  // KPIs
  const totalMontant     = ventesFiltered.reduce((s, v) => s + v.montantTotalFcfa, 0);
  const totalSolde       = ventesFiltered.reduce((s, v) => s + v.soldeDuFcfa, 0);
  const enRetard         = ventesFiltered.filter(v => v.statut === "en_retard");
  const montantEstime    = form.poidsKg && form.prixUnitaireFcfa
    ? Math.round(parseFloat(form.poidsKg) * parseInt(form.prixUnitaireFcfa))
    : null;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-green-700" />
            Ventes cacao
          </h1>
          <p className="text-sm text-gray-500 mt-1">Enregistrez la vente de lots à l'exportateur, avant expédition au port.</p>
        </div>
        {peutCreer && (
          <button
            onClick={ouvrirModalVente}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg bg-green-700 hover:bg-green-800"
          >
            <PlusCircle size={15} />
            Nouvelle vente
          </button>
        )}
      </div>

      {/* Chaîne de valeur */}
      <div className="flex items-center gap-1 text-xs text-gray-400 font-medium overflow-x-auto pb-1">
        {["Producteur", "Livraison", "Stock/Lot", "Vente ◀", "Expédition port", "Exportateur"].map((step, i) => (
          <span key={i} className={`flex items-center gap-1 whitespace-nowrap ${step.includes("◀") ? "text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded-full" : ""}`}>
            {i > 0 && <span className="text-gray-300">›</span>}
            {step.replace(" ◀", "")}
          </span>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Ventes (filtre)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{ventesFiltered.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Montant total</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formaterFCFA(totalMontant)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Solde dû</p>
          <p className={`text-lg font-bold mt-1 ${totalSolde > 0 ? "text-orange-600" : "text-green-600"}`}>{formaterFCFA(totalSolde)}</p>
        </div>
        <div className={`rounded-xl border p-4 ${enRetard.length > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">En retard</p>
          <p className={`text-2xl font-bold mt-1 ${enRetard.length > 0 ? "text-red-600" : "text-gray-900"}`}>{enRetard.length}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-600 w-48"
            placeholder="Rechercher exportateur…"
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
          />
        </div>
        <select
          value={filtreStatut}
          onChange={e => setFiltreStatut(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          <option value="">Tous les statuts</option>
          <option value="en_attente">En attente</option>
          <option value="partiel">Partiel</option>
          <option value="en_retard">En retard</option>
          <option value="regle">Réglé</option>
          <option value="refoule">Refoulé</option>
        </select>
        <select
          value={filtreExport}
          onChange={e => setFiltreExport(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          <option value="">Tous les exportateurs</option>
          {exportateurs.map(exp => (
            <option key={exp.id} value={String(exp.id)}>{exp.nom}</option>
          ))}
        </select>
        {(filtreStatut || filtreExport || recherche) && (
          <button onClick={() => { setFiltreStatut(""); setFiltreExport(""); setRecherche(""); }} className="text-xs text-gray-500 underline">
            Effacer filtres
          </button>
        )}
      </div>

      {/* Table des ventes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="space-y-0">
            {[1,2,3,4].map(i => (
              <div key={i} className="px-4 py-4 border-b border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : ventesFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <ShoppingCart className="h-12 w-12 text-gray-200" />
            <div>
              <p className="text-gray-600 font-medium">Aucune vente enregistrée</p>
              <p className="text-sm text-gray-400 mt-1">Créez une vente pour lier un lot à un exportateur.</p>
            </div>
            {peutCreer && (
              <button
                onClick={ouvrirModalVente}
                className="mt-2 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg bg-green-700 hover:bg-green-800"
              >
                <PlusCircle size={14} /> Nouvelle vente
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Lot</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Exportateur</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Poids</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Solde dû</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Échéance</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">Statut</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ventesFiltered.map(v => {
                  const isEnRetard = v.statut === "en_retard" || (
                    v.dateEcheanceReglement && new Date(v.dateEcheanceReglement) < new Date() && v.statut !== "regle"
                  );
                  return (
                    <tr key={v.id} className={`hover:bg-gray-50 transition-colors ${isEnRetard ? "bg-red-50/30" : ""}`}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formaterDate(v.dateVente)}</td>
                      <td className="px-4 py-3">
                        {v.lotId ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                            <Package size={11} className="text-gray-500" />
                            LOT-{String(v.lotId).padStart(4, "0")}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{v.exportateurNom ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{parseFloat(v.poidsKg).toLocaleString("fr-FR")} kg</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{formaterFCFA(v.montantTotalFcfa)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {v.soldeDuFcfa > 0 ? (
                          <span className="font-semibold text-orange-700">{formaterFCFA(v.soldeDuFcfa)}</span>
                        ) : (
                          <span className="text-green-600 font-medium text-xs">Soldé</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {v.dateEcheanceReglement ? (
                          <span className={isEnRetard ? "text-red-600 font-semibold" : ""}>{formaterDate(v.dateEcheanceReglement)}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[v.statut] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUT_ICON[v.statut]}
                          {STATUT_LABELS[v.statut] ?? v.statut}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {peutEncaisser && v.statut !== "regle" && v.statut !== "refoule" && v.soldeDuFcfa > 0 && (
                          <button
                            onClick={() => { setModalEncaisse(v.id); setMontantEncaisse(String(v.soldeDuFcfa)); }}
                            className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium whitespace-nowrap"
                          >
                            <Banknote size={12} /> Encaisser
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal Nouvelle vente ───────────────────────────────────── */}
      {modalVente && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2 sticky top-0 bg-white z-10">
              <ShoppingCart size={18} className="text-green-700" />
              <h3 className="font-bold text-gray-900">Nouvelle vente cacao</h3>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Toggle source */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setSourceStock("lots")}
                  className={`flex-1 py-2 text-sm font-medium transition ${sourceStock === "lots" ? "bg-green-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  📦 Lots membres
                </button>
                <button
                  onClick={() => setSourceStock("fournisseur")}
                  className={`flex-1 py-2 text-sm font-medium transition border-l border-gray-200 ${sourceStock === "fournisseur" ? "bg-purple-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  🤝 Stock fournisseur
                </button>
              </div>

              {sourceStock === "lots" ? (<>
                {/* Sélecteur de lot */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Lot à vendre</label>
                  <select
                    value={form.lotId}
                    onChange={e => handleLotChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="">— Saisie libre (sans lot) —</option>
                    {lotsEnStock.map(lot => (
                      <option key={lot.id} value={String(lot.id)}>
                        LOT-{String(lot.id).padStart(4,"0")} • {parseFloat(lot.poidsTotalKg).toLocaleString("fr-FR")} kg
                        {lot.entrepot ? ` • ${lot.entrepot}` : ""}
                      </option>
                    ))}
                  </select>
                  {lotSelectionne && (
                    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-green-800 font-medium">LOT-{String(lotSelectionne.id).padStart(4,"0")}</span>
                        <span className="text-green-700 font-bold">{parseFloat(lotSelectionne.poidsTotalKg).toLocaleString("fr-FR")} kg</span>
                      </div>
                      <p className="text-xs text-green-600 mt-0.5">
                        {lotSelectionne.entrepot ? `📦 ${lotSelectionne.entrepot} • ` : ""}
                        Créé le {formaterDate(lotSelectionne.dateCreation)}
                        {lotSelectionne.nbLivraisons ? ` • ${lotSelectionne.nbLivraisons} livraison(s)` : ""}
                      </p>
                    </div>
                  )}
                  {lotsEnStock.length === 0 && (
                    <p className="text-xs text-orange-600 mt-1">⚠️ Aucun lot en stock. Créez des lots depuis le module Traçabilité.</p>
                  )}
                </div>

                {/* Exportateur */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Exportateur *</label>
                  <select value={form.exportateurId} onChange={e => setForm(f => ({ ...f, exportateurId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
                    <option value="">— Sélectionner —</option>
                    {exportateurs.map(exp => <option key={exp.id} value={String(exp.id)}>{exp.nom}{exp.ville ? ` (${exp.ville})` : ""}</option>)}
                  </select>
                </div>

                {/* Poids + Prix */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Poids vendu (kg) *</label>
                    <input type="number" step="0.01" value={form.poidsKg}
                      onChange={e => setForm(f => ({ ...f, poidsKg: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" placeholder="18 500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Prix unitaire (FCFA/kg) *
                      {prixActuel?.prixVenteExportFcfa && <span className="ml-1 text-green-600 font-normal text-xs">· suivi des prix</span>}
                    </label>
                    <input type="number" value={form.prixUnitaireFcfa}
                      onChange={e => setForm(f => ({ ...f, prixUnitaireFcfa: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" placeholder="1 200" />
                  </div>
                </div>

                {montantEstime !== null && (
                  <div className="flex items-center justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-sm text-green-800 font-medium">Montant total estimé</span>
                    <span className="text-lg font-bold text-green-900">{formaterFCFA(montantEstime)}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date de vente *</label>
                    <input type="date" value={form.dateVente} onChange={e => setForm(f => ({ ...f, dateVente: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date d'échéance règlement</label>
                    <input type="date" value={form.dateEcheanceReglement} onChange={e => setForm(f => ({ ...f, dateEcheanceReglement: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre de sacs</label>
                  <input type="number" min="0" value={form.nombreSacs} onChange={e => setForm(f => ({ ...f, nombreSacs: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" placeholder="0" />
                </div>

                <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                  Les écritures comptables sont générées automatiquement. Le lot sélectionné sera marqué comme <strong>vendu</strong>.
                </p>
              </>) : (<>
                {/* ── Formulaire Stock Fournisseur ── */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Pisteur / fournisseur *</label>
                  <select value={formFourn.fournisseurId} onChange={e => handleFournisseurChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600">
                    <option value="">— Sélectionner —</option>
                    {stockFournisseurs.map(sf => (
                      <option key={sf.id} value={String(sf.id)}>
                        {sf.nom}{sf.prenoms ? ` ${sf.prenoms}` : ""} — {parseFloat(sf.poids_disponible_kg).toLocaleString("fr-FR")} kg dispo ({sf.nb_livraisons} livr.)
                      </option>
                    ))}
                  </select>
                  {stockFournisseurs.length === 0 && (
                    <p className="text-xs text-orange-600 mt-1">⚠️ Aucun stock fournisseur disponible.</p>
                  )}
                </div>

                {/* Checklist des livraisons */}
                {formFourn.fournisseurId && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-700">Livraisons à inclure *</label>
                      {livraisonsDisposFourn.length > 0 && (
                        <button onClick={toggleToutesLivraisons} className="text-xs text-purple-600 hover:underline">
                          {selectedLivIds.size === livraisonsDisposFourn.length ? "Tout désélectionner" : "Tout sélectionner"}
                        </button>
                      )}
                    </div>
                    {livraisonsDisposFourn.length === 0 ? (
                      <p className="text-xs text-orange-600">⚠️ Aucune livraison disponible pour ce fournisseur.</p>
                    ) : (
                      <div className="border border-gray-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                        {livraisonsDisposFourn.map(liv => (
                          <label key={liv.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-purple-50 border-b border-gray-100 last:border-b-0 ${selectedLivIds.has(liv.id) ? "bg-purple-50" : ""}`}>
                            <input type="checkbox" checked={selectedLivIds.has(liv.id)} onChange={() => toggleLivraison(liv.id)} className="accent-purple-600" />
                            <span className="text-xs text-gray-500 w-24 shrink-0">{liv.dateLivraison}</span>
                            <span className="text-xs font-medium text-gray-800">{parseFloat(liv.poidsKg).toLocaleString("fr-FR")} kg</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {selectedLivIds.size > 0 && (
                      <div className="mt-2 flex items-center justify-between px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-xs">
                        <span className="text-purple-700">{selectedLivIds.size} livraison(s) sélectionnée(s)</span>
                        <span className="font-bold text-purple-900">{poidsSelectionne.toLocaleString("fr-FR")} kg</span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Exportateur *</label>
                  <select value={formFourn.exportateurId} onChange={e => setFormFourn(f => ({ ...f, exportateurId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600">
                    <option value="">— Sélectionner —</option>
                    {exportateurs.map(exp => <option key={exp.id} value={String(exp.id)}>{exp.nom}{exp.ville ? ` (${exp.ville})` : ""}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Prix unitaire (FCFA/kg) *
                    {prixActuel?.prixVenteExportFcfa && <span className="ml-1 text-purple-600 font-normal text-xs">· suivi des prix</span>}
                  </label>
                  <input type="number" value={formFourn.prixUnitaireFcfa}
                    onChange={e => setFormFourn(f => ({ ...f, prixUnitaireFcfa: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600" placeholder="1 200" />
                </div>

                {poidsSelectionne > 0 && formFourn.prixUnitaireFcfa && (
                  <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <span className="text-sm text-purple-800 font-medium">Montant total estimé</span>
                    <span className="text-lg font-bold text-purple-900">{formaterFCFA(Math.round(poidsSelectionne * parseInt(formFourn.prixUnitaireFcfa)))}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nombre de sacs</label>
                    <input type="number" min="0" value={formFourn.nombreSacs} onChange={e => setFormFourn(f => ({ ...f, nombreSacs: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date de vente *</label>
                    <input type="date" value={formFourn.dateVente} onChange={e => setFormFourn(f => ({ ...f, dateVente: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date d'échéance règlement</label>
                  <input type="date" value={formFourn.dateEcheanceReglement} onChange={e => setFormFourn(f => ({ ...f, dateEcheanceReglement: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600" />
                </div>

                <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                  Un lot est créé depuis les livraisons sélectionnées, puis lié à la vente.
                </p>
              </>)}
            </div>

            <div className="px-6 pb-5 flex gap-3 sticky bottom-0 bg-white border-t border-gray-100 pt-4">
              <button
                onClick={() => { setModalVente(false); setForm(VENTE_INIT); setFormFourn(VENTE_FOURN_INIT); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              {sourceStock === "lots" ? (
                <button onClick={handleSubmitVente} disabled={mutVente.isPending}
                  className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium bg-green-700 hover:bg-green-800 disabled:opacity-50">
                  {mutVente.isPending ? "Enregistrement…" : "Enregistrer la vente →"}
                </button>
              ) : (
                <button onClick={handleSubmitVenteFournisseur} disabled={submittingFourn}
                  className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium bg-purple-700 hover:bg-purple-800 disabled:opacity-50">
                  {submittingFourn ? "Enregistrement…" : "Enregistrer la vente →"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Encaissement ────────────────────────────────────────── */}
      {modalEncaisse !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2">
              <Banknote size={18} className="text-green-600" />
              <h3 className="font-bold text-gray-900">Enregistrer un encaissement</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Montant encaissé (FCFA) *</label>
                <input
                  type="number"
                  value={montantEncaisse}
                  onChange={e => setMontantEncaisse(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  placeholder="Montant reçu"
                  autoFocus
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => { setModalEncaisse(null); setMontantEncaisse(""); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={() => mutEncaisse.mutate({ id: modalEncaisse!, data: { montantFcfa: parseInt(montantEncaisse) } })}
                disabled={!montantEncaisse || parseInt(montantEncaisse) <= 0 || mutEncaisse.isPending}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium bg-green-700 hover:bg-green-800 disabled:opacity-50"
              >
                {mutEncaisse.isPending ? "Enregistrement…" : "Confirmer encaissement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

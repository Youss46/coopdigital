import { useState } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import {
  useListIntrants,
  useListCategoriesIntrants,
  useGetEncoursIntrants,
  useGetRapportCampagneIntrants,
  useCreateIntrant,
  useUpdateIntrant,
  useCreateApprovIntrant,
  useCreateDistributionIntrant,
  useRemboursementManuelIntrant,
  useGetIntrantsStockAlertes,
  useGetMembres,
  getGetMembresQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Sprout, Plus, AlertTriangle, Package, TrendingDown, BarChart3, ChevronDown, X } from "lucide-react";

function formaterFCFA(n: number | string) {
  const val = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("fr-FR").format(Math.round(val)) + " FCFA";
}

function formaterNombre(n: number | string, decimales = 1) {
  const val = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: decimales }).format(val);
}

type Onglet = "catalogue" | "distribution" | "encours" | "rapport";

// ─── Modal Nouvel Intrant ────────────────────────────────────────────────────

function ModalNouvelIntrant({ onClose, categorieOptions }: { onClose: () => void; categorieOptions: Array<{ id: number; libelle: string }> }) {
  const queryClient = useQueryClient();
  const mutation = useCreateIntrant();
  const [form, setForm] = useState({ nom: "", unite: "kg", prixUnitaireFcfa: "", stockMinimum: "", description: "", fournisseurIntrant: "", datePeremption: "", categorieId: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(
      {
        data: {
          nom: form.nom,
          unite: form.unite,
          prixUnitaireFcfa: form.prixUnitaireFcfa ? parseFloat(form.prixUnitaireFcfa) : undefined,
          stockMinimum: form.stockMinimum ? parseFloat(form.stockMinimum) : undefined,
          description: form.description || undefined,
          fournisseurIntrant: form.fournisseurIntrant || undefined,
          datePeremption: form.datePeremption || undefined,
          categorieId: form.categorieId ? parseInt(form.categorieId) : undefined,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ["listIntrants"] });
          onClose();
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Nouvel intrant</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
              <input required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Ex: Engrais NPK 15-15-15" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Catégorie</label>
              <select value={form.categorieId} onChange={(e) => setForm({ ...form, categorieId: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">— Aucune —</option>
                {categorieOptions.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unité *</label>
              <select value={form.unite} onChange={(e) => setForm({ ...form, unite: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="kg">kg</option>
                <option value="litre">litre</option>
                <option value="unité">unité</option>
                <option value="sac">sac</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prix unitaire (FCFA)</label>
              <MoneyInput value={form.prixUnitaireFcfa} onChange={(raw) => setForm({ ...form, prixUnitaireFcfa: raw })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stock minimum</label>
              <input type="number" min="0" value={form.stockMinimum} onChange={(e) => setForm({ ...form, stockMinimum: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fournisseur</label>
              <input value={form.fournisseurIntrant} onChange={(e) => setForm({ ...form, fournisseurIntrant: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Nom du fournisseur" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date de péremption</label>
              <input type="date" value={form.datePeremption} onChange={(e) => setForm({ ...form, datePeremption: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
          </div>
          {mutation.isError && <p className="text-sm text-red-600">Erreur lors de la création</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700">Annuler</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2.5 rounded-lg text-white text-sm font-bold" style={{ backgroundColor: "#1a4731" }}>
              {mutation.isPending ? "Création…" : "Créer l'intrant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Approvisionnement ─────────────────────────────────────────────────

function ModalAppro({ intrantId, intrantNom, unite, onClose }: { intrantId: number; intrantNom: string; unite: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useCreateApprovIntrant();
  const [form, setForm] = useState({ dateAppro: new Date().toISOString().split("T")[0]!, quantite: "", prixUnitaireFcfa: "", fournisseur: "", numeroFacture: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(
      {
        data: {
          intrantId,
          dateAppro: form.dateAppro,
          quantite: parseFloat(form.quantite),
          prixUnitaireFcfa: parseFloat(form.prixUnitaireFcfa),
          fournisseur: form.fournisseur || undefined,
          numeroFacture: form.numeroFacture || undefined,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ["listIntrants"] });
          void queryClient.invalidateQueries({ queryKey: ["getStockAlertes"] });
          onClose();
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Approvisionnement</h3>
            <p className="text-xs text-gray-500">{intrantNom}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input type="date" required value={form.dateAppro} onChange={(e) => setForm({ ...form, dateAppro: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantité ({unite}) *</label>
              <input type="number" required min="0.001" step="0.001" value={form.quantite} onChange={(e) => setForm({ ...form, quantite: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prix unitaire (FCFA) *</label>
              <MoneyInput required value={form.prixUnitaireFcfa} onChange={(raw) => setForm({ ...form, prixUnitaireFcfa: raw })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Montant total</label>
              <div className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm font-semibold" style={{ color: "#1a4731" }}>
                {form.quantite && form.prixUnitaireFcfa
                  ? formaterFCFA(parseFloat(form.quantite) * parseFloat(form.prixUnitaireFcfa))
                  : "—"}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fournisseur</label>
              <input value={form.fournisseur} onChange={(e) => setForm({ ...form, fournisseur: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Nom du fournisseur" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">N° facture</label>
              <input value={form.numeroFacture} onChange={(e) => setForm({ ...form, numeroFacture: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="F-2024-001" />
            </div>
          </div>
          {mutation.isError && <p className="text-sm text-red-600">Erreur lors de l'approvisionnement</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700">Annuler</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2.5 rounded-lg text-white text-sm font-bold" style={{ backgroundColor: "#1a4731" }}>
              {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Remboursement Manuel ───────────────────────────────────────────────

function ModalRemboursement({ distributionId, membreNom, soldeDu, onClose }: { distributionId: number; membreNom: string; soldeDu: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useRemboursementManuelIntrant();
  const [montant, setMontant] = useState(String(soldeDu));
  const [mode, setMode] = useState<"especes" | "mobile">("especes");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]!);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(
      { data: { distributionId, montantFcfa: parseFloat(montant), mode, dateRemboursement: date } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ["getEncoursIntrants"] });
          onClose();
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Remboursement manuel</h3>
            <p className="text-xs text-gray-500">{membreNom}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Montant (FCFA) — solde dû : {formaterFCFA(soldeDu)}</label>
            <MoneyInput required value={montant} onChange={(raw) => setMontant(raw)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as "especes" | "mobile")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="especes">Espèces</option>
              <option value="mobile">Mobile money</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          {mutation.isError && <p className="text-sm text-red-600">Erreur lors du remboursement</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700">Annuler</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2.5 rounded-lg text-white text-sm font-bold" style={{ backgroundColor: "#1a4731" }}>
              {mutation.isPending ? "Enregistrement…" : "Valider"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Onglet Catalogue ─────────────────────────────────────────────────────────

function OngletCatalogue() {
  const { data: intrants, isLoading } = useListIntrants({});
  const { data: categories } = useListCategoriesIntrants();
  const { data: alertes } = useGetIntrantsStockAlertes();
  const [showModalIntrant, setShowModalIntrant] = useState(false);
  const [modalAppro, setModalAppro] = useState<{ id: number; nom: string; unite: string } | null>(null);
  const [showDetailAlertes, setShowDetailAlertes] = useState(false);

  const categorieOptions = (categories ?? []).map((c) => ({ id: c.id, libelle: c.libelle }));
  const nbAlertes = alertes?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {nbAlertes > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowDetailAlertes((v) => !v)}
                className="flex items-center gap-1 bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-semibold border border-red-200 hover:bg-red-100 transition-colors"
              >
                <AlertTriangle size={12} />
                {nbAlertes} alerte{nbAlertes > 1 ? "s" : ""} stock
                <ChevronDown size={11} className={`transition-transform ${showDetailAlertes ? "rotate-180" : ""}`} />
              </button>
              {showDetailAlertes && (
                <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-red-200 rounded-xl shadow-lg min-w-[260px] p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-red-700 mb-2">
                    Intrant{nbAlertes > 1 ? "s" : ""} en dessous du stock minimum&nbsp;:
                  </p>
                  {(alertes ?? []).map((a) => {
                    const actuel = parseFloat(String(a.stockActuel));
                    const minimum = parseFloat(String(a.stockMinimum));
                    const pct = minimum > 0 ? Math.round((actuel / minimum) * 100) : 0;
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 bg-red-50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-xs font-semibold text-gray-900">{a.nom}</p>
                          <p className="text-[11px] text-red-600 mt-0.5">
                            Stock&nbsp;: <span className="font-bold">{formaterNombre(actuel, 3)} {a.unite}</span>
                            <span className="text-gray-400 mx-1">/</span>
                            min&nbsp;: {formaterNombre(minimum, 3)} {a.unite}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowModalIntrant(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: "#1a4731" }}
        >
          <Plus size={15} />
          Nouvel intrant
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Intrant</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Catégorie</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stock actuel</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Stock min</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Prix unitaire</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(intrants ?? []).map((i) => {
                const stockBas = parseFloat(String(i.stockActuel)) < parseFloat(String(i.stockMinimum));
                return (
                  <tr key={i.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{i.nom}</span>
                        {stockBas && (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                            <AlertTriangle size={9} /> Alerte
                          </span>
                        )}
                      </div>
                      {i.description && <p className="text-xs text-gray-400 truncate max-w-xs">{i.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{i.categorieLibelle ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={stockBas ? "text-red-600 font-semibold" : "text-gray-900 font-medium"}>
                        {formaterNombre(i.stockActuel, 3)} {i.unite}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">{formaterNombre(i.stockMinimum, 3)} {i.unite}</td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">{formaterFCFA(i.prixUnitaireFcfa)} / {i.unite}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setModalAppro({ id: i.id, nom: i.nom, unite: i.unite })}
                        className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        Approvisionner
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(intrants ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Aucun intrant dans le catalogue</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModalIntrant && (
        <ModalNouvelIntrant categorieOptions={categorieOptions} onClose={() => setShowModalIntrant(false)} />
      )}
      {modalAppro && (
        <ModalAppro
          intrantId={modalAppro.id}
          intrantNom={modalAppro.nom}
          unite={modalAppro.unite}
          onClose={() => setModalAppro(null)}
        />
      )}
    </div>
  );
}

// ─── Onglet Distribution ──────────────────────────────────────────────────────

function OngletDistribution() {
  const queryClient = useQueryClient();
  const { data: intrants } = useListIntrants({});
  const [membreQ, setMembreQ] = useState("");
  const [membreSelectionne, setMembreSelectionne] = useState<{ id: number; nom: string; prenoms: string } | null>(null);
  const [intrantId, setIntrantId] = useState("");
  const [quantite, setQuantite] = useState("");
  const [mode, setMode] = useState<"credit" | "gratuit" | "subventionne">("credit");
  const [tauxSubvention, setTauxSubvention] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]!);
  const [succes, setSucces] = useState(false);

  const membresParams = { search: membreQ, limit: 8, statut: "actif" as const };
  const { data: membresData } = useGetMembres(membresParams, {
    query: { queryKey: getGetMembresQueryKey(membresParams), enabled: membreQ.length >= 2 },
  });

  const intrantSelectionne = intrants?.find((i) => i.id === parseInt(intrantId));
  const pu = parseFloat(String(intrantSelectionne?.prixUnitaireFcfa ?? 0));
  const qte = parseFloat(quantite) || 0;
  const montantTotal = qte * pu;
  const taux = parseFloat(tauxSubvention) || 0;
  const montantMembre = mode === "gratuit" ? 0 : mode === "subventionne" ? montantTotal * (1 - taux / 100) : montantTotal;

  const mutation = useCreateDistributionIntrant();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!membreSelectionne || !intrantId || qte <= 0) return;
    mutation.mutate(
      {
        data: {
          intrantId: parseInt(intrantId),
          membreId: membreSelectionne.id,
          dateDistribution: date,
          quantite: qte,
          prixUnitaireFcfa: pu,
          mode,
          tauxSubventionPct: taux,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ["listIntrants"] });
          setSucces(true);
          setMembreSelectionne(null);
          setMembreQ("");
          setIntrantId("");
          setQuantite("");
          setTimeout(() => setSucces(false), 3000);
        },
      }
    );
  };

  return (
    <div className="max-w-xl space-y-5">
      {succes && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm font-medium">
          ✅ Distribution enregistrée avec succès
        </div>
      )}
      {mutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          Erreur : stock insuffisant ou données invalides
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm">Distribuer un intrant</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Membre */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Membre / producteur *</label>
            {!membreSelectionne ? (
              <div className="relative">
                <input type="search" placeholder="Rechercher par nom…" value={membreQ} onChange={(e) => setMembreQ(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
                {membresData && membresData.membres.length > 0 && membreQ.length >= 2 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                    {membresData.membres.map((m) => (
                      <button key={m.id} type="button" onClick={() => { setMembreSelectionne({ id: m.id, nom: m.nom, prenoms: m.prenoms }); setMembreQ(""); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">{m.nom} {m.prenoms}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2.5">
                <span className="text-sm font-medium text-gray-900">{membreSelectionne.nom} {membreSelectionne.prenoms}</span>
                <button type="button" onClick={() => setMembreSelectionne(null)} className="text-gray-400 hover:text-gray-600">×</button>
              </div>
            )}
          </div>
          {/* Intrant */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Intrant *</label>
              <select required value={intrantId} onChange={(e) => setIntrantId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none">
                <option value="">— Sélectionner —</option>
                {(intrants ?? []).filter((i) => i.actif).map((i) => (
                  <option key={i.id} value={i.id}>{i.nom} (stock: {formaterNombre(i.stockActuel, 3)} {i.unite})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantité {intrantSelectionne ? `(${intrantSelectionne.unite})` : ""} *</label>
              <input type="number" required min="0.001" step="0.001" value={quantite} onChange={(e) => setQuantite(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as "credit" | "gratuit" | "subventionne")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none">
                <option value="credit">Crédit</option>
                <option value="gratuit">Gratuit</option>
                <option value="subventionne">Subventionné</option>
              </select>
            </div>
            {mode === "subventionne" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Taux subvention (%)</label>
                <input type="number" min="0" max="100" value={tauxSubvention} onChange={(e) => setTauxSubvention(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
            </div>
          </div>
          {/* Récap */}
          {qte > 0 && intrantSelectionne && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Montant total</span><span className="font-medium">{formaterFCFA(montantTotal)}</span></div>
              <div className="flex justify-between font-semibold"><span>À la charge du membre</span><span style={{ color: "#1a4731" }}>{formaterFCFA(montantMembre)}</span></div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          </div>
          <button type="submit" disabled={!membreSelectionne || !intrantId || qte <= 0 || mutation.isPending}
            className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40" style={{ backgroundColor: "#1a4731" }}>
            {mutation.isPending ? "Enregistrement…" : "Enregistrer la distribution"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Onglet Encours ───────────────────────────────────────────────────────────

function OngletEncours() {
  const { data: encours, isLoading } = useGetEncoursIntrants();
  const [modalRemb, setModalRemb] = useState<{ distributionId: number; membreNom: string; soldeDu: number } | null>(null);

  const today = new Date();

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Membre</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Total dû</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Remboursé</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Solde dû</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Dernière distrib.</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(encours ?? []).map((e) => {
                const soldeDu = parseFloat(String(e.soldeDu));
                const derniereDate = e.derniereDistribution ? new Date(e.derniereDistribution) : null;
                const joursEcoules = derniereDate ? Math.floor((today.getTime() - derniereDate.getTime()) / 86400000) : 0;
                const enRetard = joursEcoules > 60;

                return (
                  <tr key={e.membreId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{e.membreNom} {e.membrePrenoms}</span>
                        {enRetard && (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                            <AlertTriangle size={9} /> {joursEcoules}j
                          </span>
                        )}
                      </div>
                      {e.membreTelephone && <p className="text-xs text-gray-400">{e.membreTelephone}</p>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">{formaterFCFA(e.totalDu)}</td>
                    <td className="px-4 py-3 text-right text-green-600 hidden sm:table-cell">{formaterFCFA(e.totalRembourse)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">{formaterFCFA(e.soldeDu)}</td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                      {e.derniereDistribution
                        ? new Date(e.derniereDistribution).toLocaleDateString("fr-FR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setModalRemb({ distributionId: e.membreId, membreNom: `${e.membreNom} ${e.membrePrenoms}`, soldeDu })}
                        className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        Rembourser
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(encours ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Aucun encours intrant</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalRemb && (
        <ModalRemboursement
          distributionId={modalRemb.distributionId}
          membreNom={modalRemb.membreNom}
          soldeDu={modalRemb.soldeDu}
          onClose={() => setModalRemb(null)}
        />
      )}
    </div>
  );
}

// ─── Onglet Rapport ───────────────────────────────────────────────────────────

function OngletRapport() {
  const { data: rapport, isLoading } = useGetRapportCampagneIntrants({});

  if (isLoading) return <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>;

  const totaux = rapport?.totaux;
  const parIntrant = rapport?.parIntrant ?? [];
  const top10 = rapport?.top10 ?? [];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total distribué (valeur)", val: formaterFCFA(totaux?.totalDu ?? 0), icon: Package, color: "#1a4731" },
          { label: "Total remboursé", val: formaterFCFA(totaux?.totalRembourse ?? 0), icon: TrendingDown, color: "#16a34a" },
          { label: "Taux de recouvrement", val: `${totaux?.tauxRecouvrement ?? 0} %`, icon: BarChart3, color: "#c4962a" },
          { label: "Membres bénéficiaires", val: String(totaux?.nbMembres ?? 0), icon: Sprout, color: "#7c3aed" },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
                <Icon size={16} style={{ color }} />
              </div>
            </div>
            <p className="text-gray-500 text-xs">{label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{val}</p>
          </div>
        ))}
      </div>

      {/* Par intrant */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Répartition par intrant</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Intrant</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Qté totale</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Valeur distribuée</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Remboursé</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Distrib.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {parIntrant.map((i) => (
              <tr key={i.intrantId} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{i.intrantNom ?? "—"} {i.intrantUnite ? `(${i.intrantUnite})` : ""}</td>
                <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">{i.totalQuantite ? formaterNombre(i.totalQuantite, 3) : "—"}</td>
                <td className="px-4 py-3 text-right font-medium">{i.totalValeur ? formaterFCFA(i.totalValeur) : "—"}</td>
                <td className="px-4 py-3 text-right text-green-600 hidden sm:table-cell">{i.totalRembourse ? formaterFCFA(i.totalRembourse) : "—"}</td>
                <td className="px-4 py-3 text-right text-gray-500">{i.nbDistributions}</td>
              </tr>
            ))}
            {parIntrant.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Aucune donnée</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Top 10 membres */}
      {top10.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Top 10 membres par montant reçu</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {top10.map((m, idx) => (
              <div key={m.membreId} className="flex items-center gap-3 px-5 py-3">
                <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs flex items-center justify-center font-bold flex-shrink-0">
                  {idx + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-900">{m.membreNom} {m.membrePrenoms}</span>
                <span className="text-sm font-semibold" style={{ color: "#1a4731" }}>{m.totalRecu ? formaterFCFA(m.totalRecu) : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function IntrantsPage() {
  const [onglet, setOnglet] = useState<Onglet>("catalogue");
  const { data: alertes } = useGetIntrantsStockAlertes();
  const nbAlertes = alertes?.length ?? 0;

  const onglets: Array<{ id: Onglet; label: string; badge?: number }> = [
    { id: "catalogue", label: "Catalogue", badge: nbAlertes > 0 ? nbAlertes : undefined },
    { id: "distribution", label: "Distribution" },
    { id: "encours", label: "Remboursements en cours" },
    { id: "rapport", label: "Rapport campagne" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#f0f8f4" }}>
            <Sprout size={20} style={{ color: "#1a4731" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Intrants</h1>
            <p className="text-gray-500 text-sm">Gestion des intrants agricoles et distributions aux membres</p>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-full overflow-x-auto">
        {onglets.map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setOnglet(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              onglet === id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {onglet === "catalogue" && <OngletCatalogue />}
      {onglet === "distribution" && <OngletDistribution />}
      {onglet === "encours" && <OngletEncours />}
      {onglet === "rapport" && <OngletRapport />}
    </div>
  );
}

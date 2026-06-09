import { useState } from "react";
import {
  useGetEntrepots,
  useGetMouvementsStock,
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
import { useLocation } from "wouter";
import { Warehouse, TrendingUp, TrendingDown, AlertTriangle, PlusCircle, PackageCheck, Clock, ArrowRight } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
  return r.json();
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

export default function StocksPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const peutEntree = usePermission("stocks", "entree");
  const peutSortie = usePermission("stocks", "sortie");
  const [onglet, setOnglet] = useState<"entrepots" | "journal">("entrepots");
  const [modalMouvement, setModalMouvement] = useState<"entree" | "sortie" | null>(null);
  const [form, setForm] = useState({ entrepotId: "", poidsKg: "", motif: "" });
  const [modalEntrepot, setModalEntrepot] = useState(false);
  const [formEntrepot, setFormEntrepot] = useState({ nom: "", ville: "", capaciteKg: "", seuilAlerteKg: "" });
  const [errEntrepot, setErrEntrepot] = useState("");

  const mutCreerEntrepot = useMutation({
    mutationFn: () => apiPost("/api/stocks/entrepots", {
      nom: formEntrepot.nom,
      ville: formEntrepot.ville,
      capaciteKg: parseFloat(formEntrepot.capaciteKg),
      seuilAlerteKg: formEntrepot.seuilAlerteKg ? parseFloat(formEntrepot.seuilAlerteKg) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetEntrepotsQueryKey() });
      setModalEntrepot(false);
      setFormEntrepot({ nom: "", ville: "", capaciteKg: "", seuilAlerteKg: "" });
      setErrEntrepot("");
    },
    onError: (e: Error) => setErrEntrepot(e.message),
  });

  const { data: entrepots = [], isLoading } = useGetEntrepots();
  const { data: mouvements = [] } = useGetMouvementsStock();
  const { data: alertes = [] } = useGetStockAlertes();
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
        queryClient.invalidateQueries({ queryKey: getGetStockAlertesQueryKey() });
        setModalMouvement(null);
        setForm({ entrepotId: "", poidsKg: "", motif: "" });
      },
    },
  });

  const mutSortie = useSortieStock({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEntrepotsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMouvementsStockQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStockAlertesQueryKey() });
        setModalMouvement(null);
        setForm({ entrepotId: "", poidsKg: "", motif: "" });
      },
    },
  });

  const stockTotal = entrepots.reduce((s, e) => s + e.stockActuelKg, 0);
  const entreesTotal = mouvements
    .filter((m) => m.type === "entree")
    .reduce((s, m) => s + parseFloat(m.poidsKg), 0);
  const sortiesTotal = mouvements
    .filter((m) => m.type === "sortie")
    .reduce((s, m) => s + parseFloat(m.poidsKg), 0);

  const handleSubmitMouvement = () => {
    if (!form.entrepotId || !form.poidsKg) return;
    const data = {
      entrepotId: parseInt(form.entrepotId),
      poidsKg: parseFloat(form.poidsKg),
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
          { label: "Stock total", val: formaterPoids(stockTotal), icon: Warehouse, color: "#1a4731" },
          { label: "Entrées (historique)", val: formaterPoids(entreesTotal), icon: TrendingUp, color: "#22c55e" },
          { label: "Sorties (historique)", val: formaterPoids(sortiesTotal), icon: TrendingDown, color: "#ef4444" },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
            <div className="rounded-lg p-2.5" style={{ backgroundColor: color + "15" }}>
              <Icon size={20} style={{ color }} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">{label}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{val}</p>
            </div>
          </div>
        ))}
      </div>

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
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24" />
            ))
          ) : entrepots.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Warehouse size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Aucun entrepôt configuré</p>
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
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{formaterPoids(e.stockActuelKg)}</p>
                      <p className="text-xs text-gray-400">/ {formaterPoids(e.capaciteKg)}</p>
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Entrepôt</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Poids</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Motif</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {mouvements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      Aucun mouvement enregistré
                    </td>
                  </tr>
                ) : (
                  mouvements.map((m) => (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
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
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{m.motif ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                        {formaterDate(m.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Seuil alerte (kg)</label>
                  <input type="number" value={formEntrepot.seuilAlerteKg}
                    onChange={(e) => setFormEntrepot((f) => ({ ...f, seuilAlerteKg: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                    placeholder="ex. 5000" />
                </div>
              </div>
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
    </div>
  );
}

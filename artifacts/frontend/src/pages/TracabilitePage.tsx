import { useState } from "react";
import {
  useGetLots,
  useCreateLot,
  useGetLivraisonsNonLotees,
  useUpdateLotStatut,
} from "@workspace/api-client-react";
import { getGetLotsQueryKey, getGetLivraisonsNonLoteesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { QrCode, Package, PlusCircle, ChevronDown, Check } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function formaterPoids(kg: string | number) {
  const v = parseFloat(String(kg));
  return v >= 1000 ? `${(v / 1000).toFixed(2)} T` : `${v.toFixed(1)} kg`;
}

const STATUT_COLORS: Record<string, string> = {
  en_stock: "bg-green-100 text-green-700",
  vendu: "bg-blue-100 text-blue-700",
  transit: "bg-yellow-100 text-yellow-700",
};
const STATUT_LABELS: Record<string, string> = {
  en_stock: "En stock",
  vendu: "Vendu",
  transit: "En transit",
};

export default function TracabilitePage() {
  const queryClient = useQueryClient();
  const peutCreerLot = usePermission("tracabilite", "creer_lot");
  const [onglet, setOnglet] = useState<"lots" | "creer">("lots");
  const [filtreStatut, setFiltreStatut] = useState("");
  const [selection, setSelection] = useState<number[]>([]);
  const [entrepot, setEntrepot] = useState("");

  const { data: lots = [], isLoading } = useGetLots({ statut: (filtreStatut as "en_stock" | "vendu" | "transit") || undefined });
  const { data: livraisonsDispos = [] } = useGetLivraisonsNonLotees();

  const mutCreate = useCreateLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLivraisonsNonLoteesQueryKey() });
        setOnglet("lots");
        setSelection([]);
        setEntrepot("");
      },
    },
  });

  const mutStatut = useUpdateLotStatut({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetLotsQueryKey() }),
    },
  });

  const toggleSelection = (id: number) =>
    setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const poidsSelectionne = livraisonsDispos
    .filter((l) => selection.includes(l.id))
    .reduce((s, l) => s + parseFloat(l.poidsKg), 0);

  const handleCreerLot = () => {
    if (selection.length === 0) return;
    mutCreate.mutate({
      data: { cooperativeId: 1, livraisonIds: selection, entrepot: entrepot || undefined },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Traçabilité QR</h1>
          <p className="text-gray-500 text-sm mt-1">Gestion des lots de cacao et traçabilité</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["lots", "creer"] as const)
          .filter((o) => o === "lots" || peutCreerLot)
          .map((o) => (
            <button
              key={o}
              onClick={() => setOnglet(o)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                onglet === o
                  ? "border-[#1a4731] text-[#1a4731]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {o === "lots" ? "Lots en stock" : "Créer un lot"}
            </button>
          ))}
      </div>

      {/* Onglet Lots */}
      {onglet === "lots" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {["", "en_stock", "vendu", "transit"].map((s) => (
              <button
                key={s}
                onClick={() => setFiltreStatut(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filtreStatut === s
                    ? "border-[#1a4731] bg-[#1a4731] text-white"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {s === "" ? "Tous" : STATUT_LABELS[s]}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-20" />
              ))}
            </div>
          ) : lots.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <QrCode size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Aucun lot créé</p>
              <p className="text-gray-400 text-sm mt-1">
                Commencez par créer un lot depuis l'onglet "Créer un lot"
              </p>
              {peutCreerLot && (
                <button
                  onClick={() => setOnglet("creer")}
                  className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg"
                  style={{ backgroundColor: "#1a4731" }}
                >
                  Créer un lot
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">QR Code</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Poids</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Producteurs</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Entrepôt</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Statut</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((lot) => (
                      <tr key={lot.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <QrCode size={14} className="text-gray-400 flex-shrink-0" />
                            <span className="font-mono text-xs text-gray-600">
                              {lot.qrCodeLot.slice(0, 8)}…
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {formaterPoids(lot.poidsTotalKg)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                          {lot.nbProducteurs ?? 0} producteurs
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                          {lot.entrepot ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                          {formaterDate(lot.dateCreation)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[lot.statut] ?? ""}`}>
                            {STATUT_LABELS[lot.statut]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {lot.statut === "en_stock" && (
                            <button
                              onClick={() =>
                                mutStatut.mutate({ id: lot.id, data: { statut: "transit" } })
                              }
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              → Transit
                            </button>
                          )}
                          {lot.statut === "transit" && (
                            <button
                              onClick={() =>
                                mutStatut.mutate({ id: lot.id, data: { statut: "vendu" } })
                              }
                              className="text-xs text-green-600 hover:text-green-800 font-medium"
                            >
                              → Vendu
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Onglet Créer un lot */}
      {onglet === "creer" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Paramètres du lot</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Entrepôt (optionnel)</label>
                <input
                  type="text"
                  value={entrepot}
                  onChange={(e) => setEntrepot(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="ex. Entrepôt Central Méagui"
                />
              </div>
            </div>
          </div>

          {/* Sélection livraisons */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Livraisons disponibles ({livraisonsDispos.length})
              </h3>
              {selection.length > 0 && (
                <span className="text-xs font-medium text-[#1a4731]">
                  {selection.length} sélectionnée(s) — {formaterPoids(poidsSelectionne)}
                </span>
              )}
            </div>

            {livraisonsDispos.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                Toutes les livraisons sont déjà dans un lot
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="w-10 px-4 py-3"></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Membre</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Poids</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {livraisonsDispos.map((l) => {
                      const sel = selection.includes(l.id);
                      return (
                        <tr
                          key={l.id}
                          onClick={() => toggleSelection(l.id)}
                          className={`border-b border-gray-50 cursor-pointer transition-colors ${sel ? "bg-green-50" : "hover:bg-gray-50"}`}
                        >
                          <td className="px-4 py-3">
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                sel ? "border-[#1a4731] bg-[#1a4731]" : "border-gray-300"
                              }`}
                            >
                              {sel && <Check size={10} className="text-white" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {l.membreNom} {l.membrePrenoms}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{formaterPoids(l.poidsKg)}</td>
                          <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                            {formaterDate(l.dateLivraison)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selection.length > 0 && (
            <div className="bg-[#1a4731] rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="text-white">
                <p className="text-sm font-semibold">{selection.length} livraisons sélectionnées</p>
                <p className="text-green-200 text-xs">Poids total : {formaterPoids(poidsSelectionne)}</p>
              </div>
              <button
                onClick={handleCreerLot}
                disabled={mutCreate.isPending}
                className="px-5 py-2 bg-white text-[#1a4731] text-sm font-bold rounded-lg hover:bg-green-50 disabled:opacity-50 flex items-center gap-2"
              >
                <QrCode size={14} />
                {mutCreate.isPending ? "Création…" : "Créer le lot"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

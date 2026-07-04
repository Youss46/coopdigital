import { useState } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import {
  useGetCreances,
  useEncaisserVente,
} from "@workspace/api-client-react";
import { getGetCreancesQueryKey, getGetExportateursQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, DollarSign, CheckCircle } from "lucide-react";

function formaterFCFA(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}
function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUT_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-700",
  partiel: "bg-blue-100 text-blue-700",
  regle: "bg-green-100 text-green-700",
  en_retard: "bg-red-100 text-red-700",
};
const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  partiel: "Partiel",
  regle: "Réglé",
  en_retard: "EN RETARD",
};

export default function CreancesPage() {
  const queryClient = useQueryClient();
  const [modalEncaissement, setModalEncaissement] = useState<{ id: number; solde: number; nom: string } | null>(null);
  const [montant, setMontant] = useState("");

  const { data, isLoading } = useGetCreances();
  const mutEncaisser = useEncaisserVente({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCreancesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetExportateursQueryKey() });
        setModalEncaissement(null);
        setMontant("");
      },
    },
  });

  const ventes = data?.ventes ?? [];
  const aujourd_hui = new Date().toISOString().split("T")[0]!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Créances exportateurs</h1>
        <p className="text-gray-500 text-sm mt-1">Suivi des paiements à recevoir, triés par échéance</p>
      </div>

      {/* Cartes résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Total dû",
            val: formaterFCFA(data?.totalDuFcfa ?? 0),
            icon: DollarSign,
            color: "#1a4731",
          },
          {
            label: "En retard",
            val: formaterFCFA(data?.enRetardFcfa ?? 0),
            icon: AlertTriangle,
            color: "#ef4444",
          },
          {
            label: "À échoir cette semaine",
            val: formaterFCFA(data?.aEchoirSemaineFcfa ?? 0),
            icon: Clock,
            color: "#f59e0b",
          },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
            <div className="rounded-lg p-2.5 flex-shrink-0" style={{ backgroundColor: color + "15" }}>
              <Icon size={20} style={{ color }} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">{label}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tableau créances */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Exportateur</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Date vente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Échéance</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Montant total</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Solde dû</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-5 bg-gray-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : ventes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <CheckCircle size={36} className="mx-auto text-green-300 mb-2" />
                    <p className="text-gray-400 font-medium">Aucune créance en cours</p>
                    <p className="text-gray-400 text-xs mt-1">Toutes les ventes sont réglées</p>
                  </td>
                </tr>
              ) : (
                ventes.map((v) => {
                  const enRetard =
                    v.statut !== "regle" &&
                    v.dateEcheanceReglement != null &&
                    v.dateEcheanceReglement < aujourd_hui;
                  return (
                    <tr
                      key={v.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${enRetard ? "bg-red-50/30" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{v.exportateurNom ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{formaterDate(v.dateVente)}</td>
                      <td className="px-4 py-3">
                        {v.dateEcheanceReglement ? (
                          <span className={enRetard ? "text-red-600 font-semibold" : "text-gray-600"}>
                            {formaterDate(v.dateEcheanceReglement)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{formaterFCFA(v.montantTotalFcfa)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{formaterFCFA(v.soldeDuFcfa)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[v.statut] ?? ""}`}>
                          {STATUT_LABELS[v.statut]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {v.statut !== "regle" && (
                          <button
                            onClick={() =>
                              setModalEncaissement({
                                id: v.id,
                                solde: v.soldeDuFcfa,
                                nom: v.exportateurNom ?? "Exportateur",
                              })
                            }
                            className="text-xs text-[#1a4731] hover:text-green-900 font-medium whitespace-nowrap"
                          >
                            Encaisser
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal encaissement */}
      {modalEncaissement && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Enregistrer un encaissement</h3>
              <p className="text-xs text-gray-500 mt-1">{modalEncaissement.nom}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Solde restant dû</p>
                <p className="text-lg font-bold text-gray-900">{formaterFCFA(modalEncaissement.solde)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Montant encaissé (FCFA)</label>
                <MoneyInput
                  value={montant}
                  onChange={(raw) => setMontant(raw)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  autoFocus
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => { setModalEncaissement(null); setMontant(""); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={() =>
                  mutEncaisser.mutate({
                    id: modalEncaissement.id,
                    data: { montantFcfa: parseInt(montant) },
                  })
                }
                disabled={!montant || parseInt(montant) <= 0 || mutEncaisser.isPending}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "#1a4731" }}
              >
                {mutEncaisser.isPending ? "Enregistrement…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import {
  useGetAvances,
  useGetAvancesEncours,
  useCreateAvance,
  useRembourserAvance,
  useGetMembres,
} from "@workspace/api-client-react";
import { getGetAvancesQueryKey, getGetAvancesEncoursQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PlusCircle, TrendingDown, Banknote, Clock } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

function formaterFCFA(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}
function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Avances() {
  const queryClient = useQueryClient();
  const peutOctroyer = usePermission("avances", "octroyer");
  const peutRembourser = usePermission("avances", "rembourser");
  const [modalOuvert, setModalOuvert] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState<"" | "en_cours" | "rembourse" | "en_retard">("");
  const [modalRemboursement, setModalRemboursement] = useState<{ id: number; solde: number; nom: string } | null>(null);
  const [montantRemboursement, setMontantRemboursement] = useState("");

  const { data: encours } = useGetAvancesEncours();
  const { data: avancesData, isLoading } = useGetAvances({ statut: filtreStatut || undefined });
  const { data: membresData } = useGetMembres({ limit: 200 });

  const avances = avancesData?.avances ?? [];
  const membres = membresData?.membres ?? [];

  const [form, setForm] = useState({
    membreId: "",
    montantOctroyeFcfa: "",
    dateOctroi: new Date().toISOString().split("T")[0]!,
    dateEcheance: "",
    motif: "",
  });

  const mutation = useCreateAvance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAvancesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAvancesEncoursQueryKey() });
        setModalOuvert(false);
        setForm({ membreId: "", montantOctroyeFcfa: "", dateOctroi: new Date().toISOString().split("T")[0]!, dateEcheance: "", motif: "" });
      },
    },
  });

  const mutationRembourser = useRembourserAvance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAvancesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAvancesEncoursQueryKey() });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.membreId || !form.montantOctroyeFcfa) return;
    mutation.mutate({
      data: {
        membreId: parseInt(form.membreId),
        montantOctroyeFcfa: parseInt(form.montantOctroyeFcfa),
        dateOctroi: form.dateOctroi,
        dateEcheance: form.dateEcheance || undefined,
        motif: form.motif || undefined,
      },
    });
  };

  const ouvrirRemboursement = (id: number, solde: number, nom: string) => {
    setMontantRemboursement(String(solde));
    setModalRemboursement({ id, solde, nom });
  };

  const confirmerRemboursement = () => {
    if (!modalRemboursement) return;
    const montant = parseInt(montantRemboursement.replace(/\D/g, ""));
    if (isNaN(montant) || montant <= 0) return;
    mutationRembourser.mutate(
      { id: modalRemboursement.id, data: { montantFcfa: Math.min(montant, modalRemboursement.solde) } },
      { onSuccess: () => { setModalRemboursement(null); setMontantRemboursement(""); } }
    );
  };

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Avances</h1>
          <p className="text-gray-500 text-sm mt-0.5">{avancesData?.total ?? 0} avances enregistrées</p>
        </div>
        {peutOctroyer && (
          <button
            onClick={() => setModalOuvert(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-white text-sm font-medium flex-shrink-0"
            style={{ backgroundColor: "#1a4731" }}
          >
            <PlusCircle size={16} />
            <span className="hidden sm:inline">Octroyer une avance</span>
          </button>
        )}
      </div>

      {/* Résumé en cours */}
      {encours && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="rounded-lg p-2" style={{ backgroundColor: "#1a473115" }}>
              <Banknote size={18} style={{ color: "#1a4731" }} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total octroyé</p>
              <p className="font-bold text-gray-900 text-base">{formaterFCFA(encours.totalOctroye)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-green-50">
              <TrendingDown size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total remboursé</p>
              <p className="font-bold text-gray-900 text-base">{formaterFCFA(encours.totalRembourse)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-amber-50">
              <Clock size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Solde restant</p>
              <p className="font-bold text-amber-700 text-base">{formaterFCFA(encours.soldeToral)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filtre */}
      <div className="flex gap-2">
        {(["", "en_cours", "rembourse", "en_retard"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFiltreStatut(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtreStatut === s
                ? "text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            style={filtreStatut === s ? { backgroundColor: "#1a4731" } : {}}
          >
            {s === "" ? "Tous" : s === "en_cours" ? "En cours" : s === "rembourse" ? "Remboursé" : "En retard"}
          </button>
        ))}
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Membre</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Octroyé</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Remboursé</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Solde</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Échéance</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}</tr>
              ))
            ) : avances.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-400 py-12">Aucune avance</td></tr>
            ) : (
              avances.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.membreNom} {a.membrePrenoms}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formaterFCFA(a.montantOctroyeFcfa)}</td>
                  <td className="px-4 py-3 text-right text-green-700 hidden sm:table-cell">{formaterFCFA(a.montantRembourseFcfa)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-700">{formaterFCFA(a.soldeRestantFcfa)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{a.dateEcheance ? formaterDate(a.dateEcheance) : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      a.statut === "rembourse" ? "bg-green-100 text-green-700"
                      : a.statut === "en_retard" ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                    }`}>
                      {a.statut === "en_cours" ? "En cours" : a.statut === "rembourse" ? "Remboursé" : "En retard"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {peutRembourser && a.statut !== "rembourse" && a.soldeRestantFcfa > 0 && (
                      <button
                        onClick={() => ouvrirRemboursement(a.id, a.soldeRestantFcfa, `${a.membreNom} ${a.membrePrenoms}`)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Rembourser
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal octroyer */}
      {modalOuvert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Octroyer une avance</h3>
              <button onClick={() => setModalOuvert(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Membre *</label>
                <select
                  required
                  value={form.membreId}
                  onChange={(e) => setForm({ ...form, membreId: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                >
                  <option value="">Sélectionner un membre…</option>
                  {membres.filter((m) => m.statut === "actif").map((m) => (
                    <option key={m.id} value={m.id}>{m.nom} {m.prenoms} — {m.telephone}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Montant (FCFA) *</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={form.montantOctroyeFcfa}
                  onChange={(e) => setForm({ ...form, montantOctroyeFcfa: e.target.value })}
                  placeholder="150 000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date d'octroi *</label>
                  <input
                    required
                    type="date"
                    value={form.dateOctroi}
                    onChange={(e) => setForm({ ...form, dateOctroi: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date d'échéance</label>
                  <input
                    type="date"
                    value={form.dateEcheance}
                    onChange={(e) => setForm({ ...form, dateEcheance: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Motif</label>
                <input
                  value={form.motif}
                  onChange={(e) => setForm({ ...form, motif: e.target.value })}
                  placeholder="Achat engrais, frais scolaires…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                />
              </div>
              {mutation.isError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">Erreur lors de la création</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: "#c4962a" }}
                >
                  {mutation.isPending ? "Enregistrement…" : "Octroyer l'avance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal remboursement */}
      {modalRemboursement && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Rembourser une avance</h3>
              <button
                onClick={() => setModalRemboursement(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">
                Membre : <span className="font-semibold text-gray-900">{modalRemboursement.nom}</span>
              </p>
              <p className="text-sm text-gray-500">
                Solde restant : <span className="font-semibold text-amber-700">{formaterFCFA(modalRemboursement.solde)}</span>
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Montant à rembourser (FCFA) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={modalRemboursement.solde}
                  value={montantRemboursement}
                  onChange={(e) => setMontantRemboursement(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                  autoFocus
                />
              </div>
              {mutationRembourser.isError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">Erreur lors du remboursement</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalRemboursement(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={confirmerRemboursement}
                  disabled={mutationRembourser.isPending || !montantRemboursement}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: "#1a4731" }}
                >
                  {mutationRembourser.isPending ? "Enregistrement…" : "Confirmer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

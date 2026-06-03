import { useRoute, useLocation } from "wouter";
import {
  useGetMembreById,
  useGetMembreHistorique,
  useGetAvances,
  getGetMembreByIdQueryKey,
  getGetMembreHistoriqueQueryKey,
  getGetAvancesQueryKey,
} from "@workspace/api-client-react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, MapPin, Phone, Users, Leaf, Calendar, TrendingDown } from "lucide-react";

function formaterFCFA(montant: number) {
  return new Intl.NumberFormat("fr-FR").format(montant) + " FCFA";
}
function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MembreFiche() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/membres/:id");
  const id = parseInt(params?.id ?? "0");

  const { data: membre, isLoading } = useGetMembreById(id, {
    query: { queryKey: getGetMembreByIdQueryKey(id), enabled: !!id },
  });
  const { data: historique } = useGetMembreHistorique(id, {
    query: { queryKey: getGetMembreHistoriqueQueryKey(id), enabled: !!id },
  });
  const { data: avancesData } = useGetAvances({ membre_id: id }, {
    query: { queryKey: getGetAvancesQueryKey({ membre_id: id }), enabled: !!id },
  });

  const avanceEnCours = avancesData?.avances?.find((a) => a.statut === "en_cours");

  if (!match) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!membre) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p>Membre introuvable</p>
        <button onClick={() => navigate("/membres")} className="mt-3 text-sm text-blue-500 hover:underline">
          ← Retour à la liste
        </button>
      </div>
    );
  }

  const soldeCredit = avanceEnCours ? avanceEnCours.soldeRestantFcfa : 0;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Navigation */}
      <button
        onClick={() => navigate("/membres")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={15} />
        Retour à la liste
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-start gap-6">
        {/* Avatar */}
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
          style={{ backgroundColor: "#1a4731" }}
        >
          {membre.nom[0]}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900">{membre.nom} {membre.prenoms}</h1>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1"><Phone size={13} />{membre.telephone}</span>
            {membre.village && <span className="flex items-center gap-1"><MapPin size={13} />{membre.village}</span>}
            {membre.groupement && <span className="flex items-center gap-1"><Users size={13} />{membre.groupement}</span>}
            <span className="flex items-center gap-1"><Leaf size={13} />{parseFloat(membre.superficieHa).toFixed(2)} ha</span>
            <span className="flex items-center gap-1"><Calendar size={13} />Adhésion : {formaterDate(membre.dateAdhesion)}</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              membre.statut === "actif" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {membre.statut === "actif" ? "Actif" : "Inactif"}
          </span>
          {soldeCredit > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
              <TrendingDown size={11} />
              {formaterFCFA(soldeCredit)} dû
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* QR Code */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center gap-3">
          <h2 className="font-semibold text-gray-900 text-sm w-full">QR Code membre</h2>
          <div className="p-3 bg-white border border-gray-100 rounded-lg">
            <QRCodeSVG value={membre.qrCodeToken} size={140} />
          </div>
          <p className="text-xs text-gray-400 font-mono text-center break-all">{membre.qrCodeToken}</p>
        </div>

        {/* Avances */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Avances</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {!historique?.avances || historique.avances.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucune avance</p>
            ) : (
              historique.avances.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formaterFCFA(a.montantOctroyeFcfa)}</p>
                    <p className="text-xs text-gray-400">
                      {formaterDate(a.dateOctroi)}
                      {a.motif ? ` · ${a.motif}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.statut === "rembourse"
                          ? "bg-green-100 text-green-700"
                          : a.statut === "en_retard"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {a.statut === "en_cours" ? "En cours" : a.statut === "rembourse" ? "Remboursé" : "En retard"}
                    </span>
                    {a.statut !== "rembourse" && (
                      <p className="text-xs text-gray-500 mt-0.5">Solde : {formaterFCFA(a.soldeRestantFcfa)}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Historique livraisons */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Historique des livraisons</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Poids (kg)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Prix/kg</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Montant brut</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Avance déduite</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Net payé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!historique?.livraisons || historique.livraisons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-8">Aucune livraison</td>
                </tr>
              ) : (
                historique.livraisons.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formaterDate(l.dateLivraison)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{Number(l.poidsKg).toFixed(1)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{l.prixUnitaireFcfa}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formaterFCFA(l.montantBrutFcfa)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">
                      {l.avanceDeduiteFcfa > 0 ? `-${formaterFCFA(l.avanceDeduiteFcfa)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">{formaterFCFA(l.montantNetFcfa)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

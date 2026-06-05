import { useState } from "react";
import { useLocation } from "wouter";
import {
  useCreateLivraison,
  useGetMembres,
  useGetAvances,
  useGetCampagneActive,
  getGetMembresQueryKey,
  getGetAvancesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetDashboardQueryKey, getGetDashboardLivraisonsQueryKey } from "@workspace/api-client-react";
import { CheckCircle, Scale, Search, CalendarDays, ChevronDown, ChevronUp } from "lucide-react";

function formaterFCFA(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

export default function NouvelleLivraison() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [membreRecherche, setMembreRecherche] = useState("");
  const [membreSelectionne, setMembreSelectionne] = useState<{ id: number; nom: string; prenoms: string; telephone: string } | null>(null);
  const [poidsKg, setPoidsKg] = useState("");
  const [nombreSacs, setNombreSacs] = useState("");
  const [retenueKg, setRetenueKg] = useState("");
  const [sectionLivraison, setSectionLivraison] = useState("");
  const [prixUnitaire, setPrixUnitaire] = useState("900");
  const [modePaiement, setModePaiement] = useState<"orange_money" | "mtn_momo" | "especes">("especes");
  const [dateLivraison, setDateLivraison] = useState(new Date().toISOString().split("T")[0]!);
  const [showOptions, setShowOptions] = useState(false);
  const [succes, setSucces] = useState<{ montantNet: number; avanceDeduite: number } | null>(null);

  const { data: campagneActive } = useGetCampagneActive();

  const membresParams = { search: membreRecherche, limit: 10, statut: "actif" as const };
  const { data: membresData } = useGetMembres(membresParams, {
    query: { queryKey: getGetMembresQueryKey(membresParams), enabled: membreRecherche.length >= 2 },
  });

  const avancesParams = { membre_id: membreSelectionne?.id, statut: "en_cours" as const };
  const { data: avancesData } = useGetAvances(avancesParams, {
    query: { queryKey: getGetAvancesQueryKey(avancesParams), enabled: !!membreSelectionne },
  });

  const avanceEnCours = avancesData?.avances?.[0];
  const soldeAvance = avanceEnCours?.soldeRestantFcfa ?? 0;

  // Calculs temps réel
  const poids = parseFloat(poidsKg) || 0;
  const retenue = parseFloat(retenueKg) || 0;
  const poidsNet = Math.max(0, poids - retenue);
  const prix = parseInt(prixUnitaire) || 0;
  const montantBrut = Math.round(poidsNet * prix);
  const avanceDeduite = Math.min(soldeAvance, montantBrut);
  const montantNet = montantBrut - avanceDeduite;

  const mutation = useCreateLivraison({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardLivraisonsQueryKey() });
        setSucces({
          montantNet: data.livraison.montantNetFcfa,
          avanceDeduite: data.livraison.avanceDeduiteFcfa,
        });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!membreSelectionne || poidsNet <= 0 || prix <= 0) return;
    mutation.mutate({
      data: {
        membreId: membreSelectionne.id,
        poidsKg: poidsNet,
        prixUnitaireFcfa: prix,
        dateLivraison,
        modePaiement,
        campagneId: campagneActive?.id ?? null,
        nombreSacs: nombreSacs ? parseInt(nombreSacs) : null,
        retenueKg: retenue > 0 ? retenue : null,
        sectionLivraison: sectionLivraison || null,
      },
    });
  };

  if (succes) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle className="text-green-600" size={36} />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Livraison enregistrée !</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-left space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-500 text-sm">Producteur</span>
            <span className="font-medium text-sm">{membreSelectionne?.nom} {membreSelectionne?.prenoms}</span>
          </div>
          {campagneActive && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Campagne</span>
              <span className="text-sm text-gray-700">{campagneActive.libelle}</span>
            </div>
          )}
          {succes.avanceDeduite > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Avance déduite</span>
              <span className="text-amber-600 font-medium text-sm">- {formaterFCFA(succes.avanceDeduite)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-100 pt-3">
            <span className="font-semibold text-gray-900">Montant net à payer</span>
            <span
              className="text-xl font-bold px-4 py-1 rounded-lg text-white"
              style={{ backgroundColor: "#1a4731" }}
            >
              {formaterFCFA(succes.montantNet)}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setSucces(null);
              setMembreSelectionne(null);
              setMembreRecherche("");
              setPoidsKg("");
              setNombreSacs("");
              setRetenueKg("");
              setSectionLivraison("");
            }}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Nouvelle livraison
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-bold"
            style={{ backgroundColor: "#1a4731" }}
          >
            Tableau de bord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle livraison</h1>
        <p className="text-gray-500 text-sm mt-0.5">Enregistrer une livraison de cacao</p>
      </div>

      {/* Campagne active */}
      {campagneActive && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm" style={{ backgroundColor: "#f0f8f4", borderColor: "#b6dcc8" }}>
          <CalendarDays size={14} style={{ color: "#1a4731" }} />
          <span className="font-medium" style={{ color: "#1a4731" }}>Campagne active :</span>
          <span className="text-gray-700">{campagneActive.libelle}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Sélection membre */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Search size={15} />
            Producteur
          </h2>
          {!membreSelectionne ? (
            <div className="relative">
              <input
                type="search"
                placeholder="Rechercher par nom ou téléphone…"
                value={membreRecherche}
                onChange={(e) => setMembreRecherche(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
              />
              {membresData && membresData.membres.length > 0 && membreRecherche.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {membresData.membres.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMembreSelectionne({ id: m.id, nom: m.nom, prenoms: m.prenoms, telephone: m.telephone });
                        setMembreRecherche("");
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm"
                    >
                      <span className="font-medium">{m.nom} {m.prenoms}</span>
                      <span className="text-gray-400 ml-2">{m.telephone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-green-50 rounded-lg px-4 py-3">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{membreSelectionne.nom} {membreSelectionne.prenoms}</p>
                <p className="text-xs text-gray-500">{membreSelectionne.telephone}</p>
                {soldeAvance > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">Avance en cours : {formaterFCFA(soldeAvance)}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMembreSelectionne(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Pesée */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Scale size={15} />
            Pesée
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Poids brut (kg) *</label>
              <input
                required
                type="number"
                min="0.1"
                step="0.1"
                value={poidsKg}
                onChange={(e) => setPoidsKg(e.target.value)}
                placeholder="120.5"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de sacs</label>
              <input
                type="number"
                min="0"
                step="1"
                value={nombreSacs}
                onChange={(e) => setNombreSacs(e.target.value)}
                placeholder="4"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Retenue / tare (kg)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={retenueKg}
                onChange={(e) => setRetenueKg(e.target.value)}
                placeholder="0.0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Poids net (kg)</label>
              <div className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2.5 text-sm font-semibold" style={{ color: "#1a4731" }}>
                {poidsNet > 0 ? poidsNet.toFixed(1) : "—"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prix unitaire (FCFA/kg) *</label>
              <input
                required
                type="number"
                min="1"
                value={prixUnitaire}
                onChange={(e) => setPrixUnitaire(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date de livraison</label>
              <input
                type="date"
                value={dateLivraison}
                onChange={(e) => setDateLivraison(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
          </div>

          {/* Options supplémentaires */}
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mt-1"
          >
            {showOptions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showOptions ? "Masquer les options" : "Options supplémentaires"}
          </button>
          {showOptions && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mode de paiement</label>
                <select
                  value={modePaiement}
                  onChange={(e) => setModePaiement(e.target.value as "orange_money" | "mtn_momo" | "especes")}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                >
                  <option value="especes">Espèces</option>
                  <option value="orange_money">Orange Money</option>
                  <option value="mtn_momo">MTN MoMo</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Section livraison</label>
                <input
                  type="text"
                  value={sectionLivraison}
                  onChange={(e) => setSectionLivraison(e.target.value)}
                  placeholder="Ex: Nord-Ouest"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Récapitulatif */}
        {montantBrut > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="font-semibold text-gray-900 text-sm mb-3">Récapitulatif</h2>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Poids net ({poidsNet.toFixed(1)} kg × {formaterFCFA(prix)})</span>
              <span className="font-medium">{formaterFCFA(montantBrut)}</span>
            </div>
            {avanceDeduite > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-600">Avance déduite</span>
                <span className="text-amber-600 font-medium">− {formaterFCFA(avanceDeduite)}</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
              <span className="font-bold text-gray-900">Montant net à payer</span>
              <span
                className="text-2xl font-bold px-4 py-1 rounded-lg text-white"
                style={{ backgroundColor: "#1a4731" }}
              >
                {formaterFCFA(montantNet)}
              </span>
            </div>
          </div>
        )}

        {mutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
            Erreur lors de l'enregistrement de la livraison
          </p>
        )}

        <button
          type="submit"
          disabled={!membreSelectionne || poidsNet <= 0 || prix <= 0 || mutation.isPending}
          className="w-full py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-40 transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#1a4731" }}
        >
          {mutation.isPending ? "Enregistrement en cours…" : "Valider et payer"}
        </button>
      </form>
    </div>
  );
}

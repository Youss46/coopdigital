import { useState } from "react";
import { useLocation } from "wouter";
import {
  useCreateLivraison,
  useGetMembres,
  useGetAvances,
  useGetCampagneActive,
  useGetEncoursIntrantsMembre,
  useGetBalances,
  useGetConfigPesee,
  getGetMembresQueryKey,
  getGetAvancesQueryKey,
  getGetEncoursIntrantsMembreQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetDashboardQueryKey, getGetDashboardLivraisonsQueryKey } from "@workspace/api-client-react";
import { CheckCircle, Scale, Search, CalendarDays, ChevronDown, ChevronUp, Sprout, AlertTriangle } from "lucide-react";

function formaterFCFA(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

export default function NouvelleLivraison() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [membreRecherche, setMembreRecherche] = useState("");
  const [membreSelectionne, setMembreSelectionne] = useState<{ id: number; nom: string; prenoms: string; telephone: string } | null>(null);
  const [poidsKg, setPoidsKg] = useState("");
  const [poids2eme, setPoids2eme] = useState("");
  const [balanceId, setBalanceId] = useState<string>("");
  const [tauxHumidite, setTauxHumidite] = useState("");
  const [nombreSacs, setNombreSacs] = useState("");
  const [retenueKg, setRetenueKg] = useState("");
  const [sectionLivraison, setSectionLivraison] = useState("");
  const [prixUnitaire, setPrixUnitaire] = useState("900");
  const [modePaiement, setModePaiement] = useState<"orange_money" | "mtn_momo" | "especes">("especes");
  const [dateLivraison, setDateLivraison] = useState(new Date().toISOString().split("T")[0]!);
  const [showOptions, setShowOptions] = useState(false);
  const [succes, setSucces] = useState<{ montantNet: number; avanceDeduite: number; intrantsDeduits: number } | null>(null);

  const { data: campagneActive } = useGetCampagneActive();
  const { data: balancesData } = useGetBalances();
  const { data: configPesee } = useGetConfigPesee();

  const seuilDouble = Number(configPesee?.seuil_double_pesee_kg ?? 500);
  const ecartMaxPct = Number(configPesee?.ecart_max_autorise_pct ?? 2);
  const TAUX_HUMIDITE_STANDARD = 8;

  const membresParams = { search: membreRecherche, limit: 10, statut: "actif" as const };
  const { data: membresData } = useGetMembres(membresParams, {
    query: { queryKey: getGetMembresQueryKey(membresParams), enabled: membreRecherche.length >= 2 },
  });

  const avancesParams = { membre_id: membreSelectionne?.id, statut: "en_cours" as const };
  const { data: avancesData } = useGetAvances(avancesParams, {
    query: { queryKey: getGetAvancesQueryKey(avancesParams), enabled: !!membreSelectionne },
  });

  const encoursParams = membreSelectionne?.id ?? 0;
  const { data: encoursIntrantsData } = useGetEncoursIntrantsMembre(encoursParams, {
    query: {
      queryKey: getGetEncoursIntrantsMembreQueryKey(encoursParams),
      enabled: !!membreSelectionne,
    },
  });

  const avanceEnCours = avancesData?.avances?.[0];
  const soldeAvance = avanceEnCours?.soldeRestantFcfa ?? 0;
  const encoursIntrants = encoursIntrantsData?.encoursFcfa ?? 0;

  // ── Calculs pesée ─────────────────────────────────────────────────────────
  const poids1 = parseFloat(poidsKg) || 0;
  const poids2 = parseFloat(poids2eme) || 0;
  const doublePeseeRequise = poids1 > seuilDouble;
  const doublePeseeRenseignee = poids2 > 0;

  const ecartKg = doublePeseeRenseignee ? Math.abs(poids2 - poids1) : 0;
  const ecartPct = poids1 > 0 && doublePeseeRenseignee ? (ecartKg / poids1) * 100 : 0;
  const ecartExcessif = ecartPct > ecartMaxPct && doublePeseeRenseignee;
  const poidsRetenu = doublePeseeRenseignee ? (poids1 + poids2) / 2 : poids1;

  // ── Calculs humidité ──────────────────────────────────────────────────────
  const taux = parseFloat(tauxHumidite) || 0;
  const retenueHumiditeKg = taux > TAUX_HUMIDITE_STANDARD && poidsRetenu > 0
    ? Math.round(poidsRetenu * (taux - TAUX_HUMIDITE_STANDARD) / 100 * 1000) / 1000
    : 0;

  // ── Calculs finaux ────────────────────────────────────────────────────────
  const retenueTare = parseFloat(retenueKg) || 0;
  const retenueTotal = retenueTare + retenueHumiditeKg;
  const poidsNet = Math.max(0, poidsRetenu - retenueTotal);
  const prix = parseInt(prixUnitaire) || 0;
  const montantBrut = Math.round(poidsNet * prix);
  const avanceDeduite = Math.min(soldeAvance, montantBrut);
  const apresAvance = montantBrut - avanceDeduite;
  const intrantsDeduits = Math.min(encoursIntrants, Math.max(0, apresAvance));
  const montantNet = apresAvance - intrantsDeduits;

  const mutation = useCreateLivraison({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardLivraisonsQueryKey() });
        setSucces({
          montantNet: data.livraison.montantNetFcfa,
          avanceDeduite: data.livraison.avanceDeduiteFcfa,
          intrantsDeduits: data.livraison.intrantsDeduitsFcfa ?? 0,
        });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!membreSelectionne || poidsNet <= 0 || prix <= 0) return;
    // La double pesée est obligatoire si poids > seuil — mais on laisse quand même soumettre (avertissement visible)
    mutation.mutate({
      data: {
        membreId: membreSelectionne.id,
        poidsKg: poidsNet,
        prixUnitaireFcfa: prix,
        dateLivraison,
        modePaiement,
        campagneId: campagneActive?.id ?? null,
        nombreSacs: nombreSacs ? parseInt(nombreSacs) : null,
        retenueKg: retenueTotal > 0 ? retenueTotal : null,
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
              <span className="text-amber-600 font-medium text-sm">− {formaterFCFA(succes.avanceDeduite)}</span>
            </div>
          )}
          {succes.intrantsDeduits > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Intrants déduits</span>
              <span className="text-orange-600 font-medium text-sm">− {formaterFCFA(succes.intrantsDeduits)}</span>
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
              setPoids2eme("");
              setNombreSacs("");
              setRetenueKg("");
              setSectionLivraison("");
              setTauxHumidite("");
              setBalanceId("");
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
                {encoursIntrants > 0 && (
                  <p className="text-xs text-orange-600 mt-0.5 flex items-center gap-1">
                    <Sprout size={10} />
                    Intrants dus : {formaterFCFA(encoursIntrants)}
                  </p>
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

          {/* Balance */}
          {(balancesData?.balances ?? []).length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Balance utilisée</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                value={balanceId}
                onChange={(e) => setBalanceId(e.target.value)}
              >
                <option value="">— Sélectionner une balance —</option>
                {(balancesData?.balances ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.marque ?? "Balance"} {b.numero_serie ? `#${b.numero_serie}` : ""}{b.site ? ` — ${b.site}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {doublePeseeRequise ? "1ère pesée (kg) *" : "Poids brut (kg) *"}
              </label>
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

          {/* Alerte double pesée requise */}
          {doublePeseeRequise && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>Double pesée obligatoire pour {poids1.toFixed(1)} kg (seuil : {seuilDouble} kg)</span>
            </div>
          )}

          {/* 2ème pesée */}
          {(doublePeseeRequise || doublePeseeRenseignee) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  2ème pesée (kg) {doublePeseeRequise ? "*" : ""}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={poids2eme}
                  onChange={(e) => setPoids2eme(e.target.value)}
                  placeholder="121.0"
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none ${ecartExcessif ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Écart</label>
                <div className={`w-full border rounded-lg px-3 py-2.5 text-sm font-medium ${
                  ecartExcessif ? "border-red-200 bg-red-50 text-red-700" :
                  doublePeseeRenseignee ? "border-green-200 bg-green-50 text-green-700" :
                  "border-gray-100 bg-gray-50 text-gray-400"
                }`}>
                  {doublePeseeRenseignee ? `${ecartKg.toFixed(3)} kg (${ecartPct.toFixed(2)} %)` : "—"}
                </div>
              </div>
            </div>
          )}

          {ecartExcessif && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-800">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Écart de {ecartPct.toFixed(2)} % dépasse le seuil de {ecartMaxPct} % — un litige sera créé automatiquement
            </div>
          )}

          {/* Poids retenu (si double pesée) */}
          {doublePeseeRenseignee && (
            <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2 text-sm">
              <span className="text-gray-600">Poids retenu (moyenne)</span>
              <span className="font-bold" style={{ color: "#1a4731" }}>{poidsRetenu.toFixed(3)} kg</span>
            </div>
          )}

          {/* Taux d'humidité */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Taux d'humidité (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={tauxHumidite}
                onChange={(e) => setTauxHumidite(e.target.value)}
                placeholder="Ex: 10"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              />
              {taux > TAUX_HUMIDITE_STANDARD && (
                <p className="text-xs text-amber-600 mt-0.5">Retenue humidité : −{retenueHumiditeKg.toFixed(3)} kg</p>
              )}
            </div>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Poids net (kg)</label>
              <div className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2.5 text-sm font-semibold" style={{ color: "#1a4731" }}>
                {poidsNet > 0 ? poidsNet.toFixed(3) : "—"}
              </div>
            </div>
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

        {/* Récapitulatif enrichi */}
        {montantBrut > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="font-semibold text-gray-900 text-sm mb-3">Récapitulatif</h2>
            {doublePeseeRenseignee && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>Poids retenu (pesée)</span>
                <span>{poidsRetenu.toFixed(3)} kg</span>
              </div>
            )}
            {retenueHumiditeKg > 0 && (
              <div className="flex justify-between text-xs text-amber-600">
                <span>− Retenue humidité ({taux}%)</span>
                <span>−{retenueHumiditeKg.toFixed(3)} kg</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Montant brut ({poidsNet.toFixed(3)} kg × {prix} FCFA)</span>
              <span className="font-medium">{formaterFCFA(montantBrut)}</span>
            </div>
            {avanceDeduite > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-600">− Avance déduite</span>
                <span className="text-amber-600 font-medium">− {formaterFCFA(avanceDeduite)}</span>
              </div>
            )}
            {intrantsDeduits > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-orange-600 flex items-center gap-1">
                  <Sprout size={12} />
                  − Intrants dus
                </span>
                <span className="text-orange-600 font-medium">− {formaterFCFA(intrantsDeduits)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-3 mt-1 flex justify-between items-center">
              <span className="font-bold text-gray-900">NET À PAYER ✅</span>
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

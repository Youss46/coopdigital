import { useState } from "react";
import {
  PackageX, Loader2, AlertTriangle, CheckCircle2, RotateCcw,
  TrendingDown, ShoppingCart, UserPlus,
} from "lucide-react";
import {
  useListRefus,
  useGetStatsRefus,
  useTraiterRefus,
  useGetExportateurs,
  getGetEntrepotsQueryKey,
  getGetMouvementsStockQueryKey,
  getGetStockAlertesQueryKey,
  getListRefusQueryKey,
  getGetStatsRefusQueryKey,
  ListRefusStatut,
  type TraiterRefusInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";

const INPUT_CLS =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";
const BTN_CLS =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors";

const DECISION_LABELS: Record<string, string> = {
  retour_stock: "Retour stock",
  declassement: "Déclassement",
  autre_acheteur: "Autre acheteur",
  perte: "Perte",
};

const DECISION_ICONS: Record<string, React.ElementType> = {
  retour_stock: RotateCcw,
  declassement: TrendingDown,
  autre_acheteur: ShoppingCart,
  perte: AlertTriangle,
};

const DECISION_COLORS: Record<string, string> = {
  retour_stock: "text-blue-600",
  declassement: "text-amber-600",
  autre_acheteur: "text-green-600",
  perte: "text-red-600",
};

function fmt(v: number | string | undefined | null, suffix = " kg") {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("fr-FR") + suffix;
}

function fmtFcfa(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}

interface TraiterModalProps {
  refusId: number;
  poidsKg: string;
  onClose: () => void;
  onDone: () => void;
}

function TraiterModal({ refusId, poidsKg, onClose, onDone }: TraiterModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const traiterMut = useTraiterRefus();
  const { data: exportateurs = [] } = useGetExportateurs();

  const [form, setForm] = useState<Partial<TraiterRefusInput>>({
    decision: "retour_stock",
    modeReglement: "immediat",
    dateVenteRefus: new Date().toISOString().slice(0, 10),
  });
  const [nouvelAcheteur, setNouvelAcheteur] = useState(false);

  function field<K extends keyof TraiterRefusInput>(k: K, v: TraiterRefusInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const poids = parseFloat(poidsKg) || 0;
  const prix = form.prixUnitaireNouveauFcfa ?? 0;
  const montantTotal = Math.round(poids * prix);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.decision) return;

    if (form.decision === "autre_acheteur") {
      if (!prix) {
        toast({ title: "Prix unitaire requis", variant: "destructive" });
        return;
      }
      if (!nouvelAcheteur && !form.acheteurId) {
        toast({ title: "Sélectionnez un acheteur", variant: "destructive" });
        return;
      }
      if (nouvelAcheteur && !form.nomNouvelAcheteur?.trim()) {
        toast({ title: "Nom de l'acheteur requis", variant: "destructive" });
        return;
      }
      if (form.modeReglement === "credit" && !form.dateEcheanceRefus) {
        toast({ title: "Date d'échéance requise pour vente à crédit", variant: "destructive" });
        return;
      }
    }

    try {
      const payload: TraiterRefusInput = {
        ...(form as TraiterRefusInput),
        ...(form.decision === "autre_acheteur" && nouvelAcheteur
          ? { acheteurId: undefined }
          : {}),
        ...(form.decision === "autre_acheteur" && !nouvelAcheteur
          ? { nomNouvelAcheteur: undefined, telNouvelAcheteur: undefined }
          : {}),
      };
      await traiterMut.mutateAsync({ id: refusId, data: payload });
      void queryClient.invalidateQueries({ queryKey: getGetEntrepotsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetMouvementsStockQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetStockAlertesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListRefusQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetStatsRefusQueryKey() });
      toast({ title: "Lot refoulé traité avec succès" });
      onDone();
    } catch {
      toast({ title: "Erreur lors du traitement", variant: "destructive" });
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-gray-900 text-lg">Traiter le refus</h2>
        <p className="text-sm text-gray-500">Poids refoulé : <strong>{fmt(poidsKg)}</strong></p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Décision */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Décision *</label>
            <div className="grid grid-cols-2 gap-2">
              {(["retour_stock", "declassement", "autre_acheteur", "perte"] as const).map((d) => {
                const Icon = DECISION_ICONS[d]!;
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => field("decision", d)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      form.decision === d
                        ? "border-green-600 bg-green-50 text-green-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {DECISION_LABELS[d]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Retour stock ── */}
          {form.decision === "retour_stock" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Entrepôt de destination</label>
              <input
                type="number"
                className={INPUT_CLS}
                placeholder="ID entrepôt"
                value={form.entrepotRetourId ?? ""}
                onChange={(e) => field("entrepotRetourId", parseInt(e.target.value))}
              />
            </div>
          )}

          {/* ── Déclassement ── */}
          {form.decision === "declassement" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ancien grade</label>
                <input className={INPUT_CLS} value={form.ancienGrade ?? ""} onChange={(e) => field("ancienGrade", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nouveau grade</label>
                <input className={INPUT_CLS} value={form.nouveauGrade ?? ""} onChange={(e) => field("nouveauGrade", e.target.value)} />
              </div>
            </div>
          )}

          {/* ── Autre acheteur ── */}
          {form.decision === "autre_acheteur" && (
            <div className="space-y-3">
              {/* Prix unitaire */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prix unitaire (FCFA/kg) *</label>
                <input
                  type="number"
                  className={INPUT_CLS}
                  placeholder="Ex: 850"
                  value={form.prixUnitaireNouveauFcfa ?? ""}
                  onChange={(e) => field("prixUnitaireNouveauFcfa", parseInt(e.target.value))}
                />
                {prix > 0 && (
                  <p className="text-xs text-green-700 font-medium mt-1">
                    Montant total : {fmt(poids, "")} kg × {prix.toLocaleString("fr-FR")} = <strong>{fmtFcfa(montantTotal)}</strong>
                  </p>
                )}
              </div>

              {/* Acheteur */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600">Acheteur *</label>
                  <button
                    type="button"
                    onClick={() => { setNouvelAcheteur(!nouvelAcheteur); field("acheteurId", undefined); field("nomNouvelAcheteur", undefined); }}
                    className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800 font-medium"
                  >
                    <UserPlus className="w-3 h-3" />
                    {nouvelAcheteur ? "Acheteur existant" : "Nouvel acheteur"}
                  </button>
                </div>
                {!nouvelAcheteur ? (
                  <select
                    className={INPUT_CLS}
                    value={form.acheteurId ?? ""}
                    onChange={(e) => field("acheteurId", parseInt(e.target.value) || undefined)}
                  >
                    <option value="">— Sélectionner —</option>
                    {exportateurs.map((exp) => (
                      <option key={exp.id} value={exp.id}>{exp.nom}</option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input
                      className={INPUT_CLS}
                      placeholder="Nom de l'acheteur *"
                      value={form.nomNouvelAcheteur ?? ""}
                      onChange={(e) => field("nomNouvelAcheteur", e.target.value)}
                    />
                    <input
                      className={INPUT_CLS}
                      placeholder="Téléphone (optionnel)"
                      value={form.telNouvelAcheteur ?? ""}
                      onChange={(e) => field("telNouvelAcheteur", e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Date de vente */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date de vente *</label>
                <input
                  type="date"
                  className={INPUT_CLS}
                  value={form.dateVenteRefus ?? ""}
                  onChange={(e) => field("dateVenteRefus", e.target.value)}
                />
              </div>

              {/* Mode règlement */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Mode règlement *</label>
                <div className="flex gap-3">
                  {(["immediat", "credit"] as const).map((m) => (
                    <label key={m} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="modeReglement"
                        value={m}
                        checked={form.modeReglement === m}
                        onChange={() => field("modeReglement", m)}
                        className="text-green-600"
                      />
                      <span className="text-sm text-gray-700">{m === "immediat" ? "Immédiat" : "À crédit"}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Date d'échéance si à crédit */}
              {form.modeReglement === "credit" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date d'échéance *</label>
                  <input
                    type="date"
                    className={INPUT_CLS}
                    value={form.dateEcheanceRefus ?? ""}
                    onChange={(e) => field("dateEcheanceRefus", e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Perte ── */}
          {form.decision === "perte" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Motif de perte</label>
                <input className={INPUT_CLS} value={form.motifPerte ?? ""} onChange={(e) => field("motifPerte", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Taux humidité (%)</label>
                <input type="number" step="0.1" className={INPUT_CLS} value={form.tauxHumidite ?? ""} onChange={(e) => field("tauxHumidite", parseFloat(e.target.value))} />
              </div>
            </>
          )}

          {/* PV de constat */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="pvConstat"
              checked={form.pvConstat ?? false}
              onChange={(e) => field("pvConstat", e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="pvConstat" className="text-sm text-gray-700">PV de constat établi</label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={`${BTN_CLS} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
              Annuler
            </button>
            <button type="submit" disabled={traiterMut.isPending} className={`${BTN_CLS} bg-green-600 text-white hover:bg-green-700 disabled:opacity-50`}>
              {traiterMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Valider
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RefusPage() {
  const peutTraiter = usePermission("refus", "traiter");
  const [filtreStatut, setFiltreStatut] = useState<string>("en_attente");
  const [modal, setModal] = useState<{ id: number; poids: string } | null>(null);

  const { data: refusList, isLoading, refetch } = useListRefus({ statut: (filtreStatut as ListRefusStatut) || undefined });
  const { data: stats } = useGetStatsRefus();

  const kpis = [
    { label: "En attente", value: Number(stats?.nbEnAttente ?? 0), sub: fmt(stats?.totalEnAttenteKg), color: "text-red-600", bg: "bg-red-50" },
    { label: "Traités", value: Number(stats?.nbTraites ?? 0), sub: fmt(stats?.totalTraitesKg), color: "text-green-600", bg: "bg-green-50" },
    { label: "Total refoulé", value: fmt(stats?.totalRefulesKg), sub: null, color: "text-gray-900", bg: "bg-gray-50" },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {modal && (
        <TraiterModal
          refusId={modal.id}
          poidsKg={modal.poids}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); void refetch(); }}
        />
      )}

      {/* En-tête */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
          <PackageX className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stocks refoulés</h1>
          <p className="text-sm text-gray-500">Lots refusés par les exportateurs</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${k.bg} rounded-xl p-3`}>
            <div className="text-xs text-gray-500 mb-1">{k.label}</div>
            <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
            {k.sub && <div className="text-xs text-gray-400">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filtre */}
      <div className="flex gap-2">
        {[{ v: "en_attente", l: "En attente" }, { v: "traite", l: "Traités" }, { v: "", l: "Tous" }].map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setFiltreStatut(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtreStatut === v ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-green-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {refusList?.map((row) => {
            const r = row.refus;
            const estTraite = r.statut === "traite";
            return (
              <div
                key={r.id}
                className={`bg-white rounded-xl border p-4 ${estTraite ? "border-gray-200" : "border-red-200"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {estTraite ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Traité
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> En attente
                        </span>
                      )}
                      {r.decision && (
                        <span className={`text-xs font-medium ${DECISION_COLORS[r.decision] ?? ""}`}>
                          · {DECISION_LABELS[r.decision]}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-gray-900 text-sm">
                      Lot #{r.venteExportateurId}
                      {row.vente?.produit && ` — ${row.vente.produit}`}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Poids : <strong>{fmt(r.poidsRefuleKg)}</strong>
                      {row.vente?.numeroBonSortie && ` · BS n°${row.vente.numeroBonSortie}`}
                    </div>
                    {r.motifRefus && (
                      <div className="text-xs text-gray-400 mt-0.5 italic">Motif : {r.motifRefus}</div>
                    )}
                  </div>
                  {!estTraite && peutTraiter && (
                    <button
                      onClick={() => setModal({ id: r.id, poids: r.poidsRefuleKg })}
                      className={`${BTN_CLS} bg-green-600 text-white hover:bg-green-700 text-xs px-3 py-1.5`}
                    >
                      Traiter
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!refusList?.length && (
            <div className="text-center py-12 text-gray-400">
              <PackageX className="w-10 h-10 mx-auto mb-3 opacity-30" />
              Aucun lot refoulé
            </div>
          )}
        </div>
      )}
    </div>
  );
}

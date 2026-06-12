import { useState, useEffect } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import { useQuery } from "@tanstack/react-query";
import {
  useGetBudgetCampagneId,
  usePostBudgetCampagneId,
  usePutBudgetIdLigne,
  usePutBudgetIdValider,
  useGetBudgetIdAlertes,
  useGetBudgetIdRapport,
  usePostBudgetIdHypotheses,
  usePostBudgetIdSync,
  type LigneBudget,
  type BudgetDetail,
  type RapportBudget,
  getGetBudgetCampagneIdQueryKey,
  getGetBudgetIdAlertesQueryKey,
  getGetBudgetIdRapportQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle, CheckCircle2, RefreshCw, CheckCheck, Edit2, X, TrendingUp,
  TrendingDown, Target,
} from "lucide-react";

const VERT = "#1a4731";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";

async function apiFetchCampagne<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { Authorization: `Bearer ${tok()}` },
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json() as Promise<T>;
}

const FCFA = (n: number | undefined | null) =>
  new Intl.NumberFormat("fr-FR").format(Math.round(n ?? 0)) + " FCFA";

const PCT = (n: number | string | null | undefined) => {
  const v = parseFloat(String(n ?? "0"));
  if (isNaN(v)) return "0,0%";
  return (v >= 0 ? "+" : "") + v.toFixed(1).replace(".", ",") + "%";
};

const CAT_LABELS: Record<string, string> = {
  recette:             "Recettes",
  charge_achat:        "Charges d'achat",
  charge_exploitation: "Charges d'exploitation",
  charge_personnel:    "Charges de personnel",
  charge_financiere:   "Charges financières",
  investissement:      "Investissements",
};
const CAT_ORDER = [
  "recette",
  "charge_achat",
  "charge_exploitation",
  "charge_personnel",
  "charge_financiere",
  "investissement",
];

function ecartColor(pct: number) {
  const abs = Math.abs(pct);
  if (abs <= 5)  return "text-green-700 bg-green-50";
  if (abs <= 15) return "text-orange-700 bg-orange-50";
  return "text-red-700 bg-red-50";
}
function ecartIcon(pct: number) {
  if (pct > 15)  return <AlertTriangle size={13} className="inline text-red-600 mr-0.5" />;
  if (pct > 5)   return <TrendingUp    size={13} className="inline text-orange-500 mr-0.5" />;
  if (pct < -5)  return <TrendingDown  size={13} className="inline text-blue-500 mr-0.5" />;
  return <CheckCircle2 size={13} className="inline text-green-600 mr-0.5" />;
}

// ─── Onglet 1 : Hypothèses ────────────────────────────────────────────────────
function OngletHypotheses({ budgetId, campagneId }: { budgetId: number; campagneId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const peutModifier = usePermission("budget", "modifier");
  const [form, setForm] = useState({
    tonnagePrevisionnelKg: "",
    prixAchatMoyenFcfa:    "",
    prixVenteMoyenFcfa:    "",
    nbMembresActifs:       "",
    nbLivraisonsEstimees:  "",
  });

  const mutHypo = usePostBudgetIdHypotheses({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBudgetCampagneIdQueryKey(campagneId) });
        toast({ title: "Hypothèses enregistrées" });
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  const tonnage = parseFloat(form.tonnagePrevisionnelKg) || 0;
  const pxAchat = parseFloat(form.prixAchatMoyenFcfa)   || 0;
  const pxVente = parseFloat(form.prixVenteMoyenFcfa)   || 0;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-5">Hypothèses de campagne</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            { key: "tonnagePrevisionnelKg", label: "Tonnage prévisionnel (kg)", placeholder: "ex : 500000" },
            { key: "prixAchatMoyenFcfa",    label: "Prix d'achat moyen estimé (FCFA/kg)", placeholder: "ex : 1200" },
            { key: "prixVenteMoyenFcfa",    label: "Prix de vente moyen estimé (FCFA/kg)", placeholder: "ex : 1650" },
            { key: "nbMembresActifs",        label: "Nombre de membres actifs estimé", placeholder: "ex : 250" },
            { key: "nbLivraisonsEstimees",   label: "Nombre de livraisons estimées", placeholder: "ex : 800" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                type="number"
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                disabled={!peutModifier}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 disabled:bg-gray-50"
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>

        {(tonnage > 0 || pxAchat > 0 || pxVente > 0) && (
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Marge brute estimée</p>
              <p className="text-lg font-bold text-green-700">{FCFA((pxVente - pxAchat) * tonnage)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">CA prévisionnel</p>
              <p className="text-lg font-bold text-blue-700">{FCFA(pxVente * tonnage)}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Coût d'achat prévisionnel</p>
              <p className="text-lg font-bold text-orange-700">{FCFA(pxAchat * tonnage)}</p>
            </div>
          </div>
        )}

        {peutModifier && (
          <div className="mt-5 flex justify-end">
            <button
              onClick={() =>
                mutHypo.mutate({
                  id: budgetId,
                  data: {
                    tonnagePrevisionnelKg: tonnage  || undefined,
                    prixAchatMoyenFcfa:   pxAchat  || undefined,
                    prixVenteMoyenFcfa:   pxVente  || undefined,
                    nbMembresActifs:      parseInt(form.nbMembresActifs)      || undefined,
                    nbLivraisonsEstimees: parseInt(form.nbLivraisonsEstimees) || undefined,
                  },
                })
              }
              disabled={mutHypo.isPending}
              className="px-5 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: VERT }}
            >
              {mutHypo.isPending ? "Enregistrement…" : "Enregistrer les hypothèses"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal modifier ligne ─────────────────────────────────────────────────────
function ModalModifierLigne({ ligne, budgetId, campagneId, onClose }: {
  ligne: LigneBudget; budgetId: number; campagneId: number; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [montant, setMontant] = useState(
    String(parseFloat(ligne.montant_previsionnel_fcfa ?? "0"))
  );

  const mutLigne = usePutBudgetIdLigne({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBudgetCampagneIdQueryKey(campagneId) });
        queryClient.invalidateQueries({ queryKey: getGetBudgetIdRapportQueryKey(budgetId) });
        toast({ title: "Ligne mise à jour" });
        onClose();
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Modifier le prévisionnel</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ligne</label>
            <p className="text-sm text-gray-900 font-medium">{ligne.libelle}</p>
            <p className="text-xs text-gray-400">{CAT_LABELS[ligne.categorie] ?? ligne.categorie}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Montant prévisionnel (FCFA)</label>
            <MoneyInput
              value={montant}
              onChange={(raw) => setMontant(raw)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
              placeholder="0"
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700"
          >
            Annuler
          </button>
          <button
            onClick={() =>
              mutLigne.mutate({
                id: budgetId,
                data: { ligneId: ligne.id, montantPrevisionnelFcfa: parseFloat(montant) || 0 },
              })
            }
            disabled={mutLigne.isPending}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: VERT }}
          >
            {mutLigne.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet 2 : Budget détaillé ───────────────────────────────────────────────
function OngletBudgetDetail({ data, budgetId, campagneId }: { data: BudgetDetail; budgetId: number; campagneId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const peutModifier = usePermission("budget", "modifier");
  const peutValider  = usePermission("budget", "valider");
  const [ligneEdit, setLigneEdit] = useState<LigneBudget | null>(null);

  const mutSync = usePostBudgetIdSync({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBudgetCampagneIdQueryKey(campagneId) });
        toast({ title: "Réalisé synchronisé" });
      },
    },
  });

  const mutValider = usePutBudgetIdValider({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBudgetCampagneIdQueryKey(campagneId) });
        toast({ title: "Budget validé ✓" });
      },
    },
  });

  const { lignes, resultat } = data;
  const lignesParCat = CAT_ORDER.reduce<Record<string, LigneBudget[]>>((acc, cat) => {
    acc[cat] = lignes.filter((l) => l.categorie === cat);
    return acc;
  }, {});

  const previsionnel = resultat.previsionnel ?? 0;
  const realise      = resultat.realise      ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            data.budget.statut === "valide"
              ? "bg-green-100 text-green-700"
              : data.budget.statut === "cloture"
              ? "bg-gray-100 text-gray-600"
              : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {data.budget.statut === "brouillon"
            ? "Brouillon"
            : data.budget.statut === "valide"
            ? "Validé"
            : "Clôturé"}
        </span>
        <div className="ml-auto flex gap-2">
          {peutModifier && (
            <button
              onClick={() => mutSync.mutate({ id: budgetId })}
              disabled={mutSync.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw size={13} />
              {mutSync.isPending ? "Sync…" : "Sync réalisé"}
            </button>
          )}
          {peutValider && data.budget.statut === "brouillon" && (
            <button
              onClick={() => mutValider.mutate({ id: budgetId })}
              disabled={mutValider.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg"
              style={{ backgroundColor: VERT }}
            >
              <CheckCheck size={13} />
              Valider le budget
            </button>
          )}
        </div>
      </div>

      {CAT_ORDER.map((cat) => {
        const rows = lignesParCat[cat] ?? [];
        if (rows.length === 0) return null;
        const totalPrev = rows.reduce((s, l) => s + parseFloat(l.montant_previsionnel_fcfa ?? "0"), 0);
        const totalReel = rows.reduce((s, l) => s + parseFloat(l.montant_realise_fcfa      ?? "0"), 0);
        const catEcartPct = totalPrev > 0 ? ((totalReel - totalPrev) / totalPrev) * 100 : 0;

        return (
          <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <h4 className="font-semibold text-sm text-gray-700">{CAT_LABELS[cat] ?? cat}</h4>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>Total prévu : <strong className="text-gray-900">{FCFA(totalPrev)}</strong></span>
                <span>Réalisé : <strong className="text-gray-900">{FCFA(totalReel)}</strong></span>
                <span className={`px-1.5 py-0.5 rounded font-semibold ${ecartColor(catEcartPct)}`}>
                  {ecartIcon(catEcartPct)}{PCT(catEcartPct)}
                </span>
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {rows.map((l) => {
                  const pct  = parseFloat(l.ecart_pct ?? "0");
                  const prev = parseFloat(l.montant_previsionnel_fcfa ?? "0");
                  const reel = parseFloat(l.montant_realise_fcfa      ?? "0");
                  return (
                    <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-700">{l.libelle}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 font-mono text-xs">{FCFA(prev)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900 font-mono text-xs font-medium">{FCFA(reel)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${ecartColor(pct)}`}>
                          {ecartIcon(pct)}{PCT(pct)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {peutModifier && data.budget.statut !== "cloture" && (
                          <button
                            onClick={() => setLigneEdit(l)}
                            className="text-gray-400 hover:text-gray-700 p-1 rounded"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="bg-gray-900 rounded-xl p-5 flex items-center justify-between">
        <span className="text-white font-bold text-sm">RÉSULTAT (Recettes − Charges)</span>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs text-gray-400">Prévisionnel</p>
            <p className={`font-bold text-base ${previsionnel >= 0 ? "text-green-400" : "text-red-400"}`}>
              {FCFA(previsionnel)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Réalisé</p>
            <p className={`font-bold text-base ${realise >= 0 ? "text-green-400" : "text-red-400"}`}>
              {FCFA(realise)}
            </p>
          </div>
        </div>
      </div>

      {ligneEdit && (
        <ModalModifierLigne ligne={ligneEdit} budgetId={budgetId} campagneId={campagneId} onClose={() => setLigneEdit(null)} />
      )}
    </div>
  );
}

// ─── Onglet 3 : Suivi graphique ───────────────────────────────────────────────
function OngletSuivi({ budgetId }: { budgetId: number }) {
  const { data: rapport } = useGetBudgetIdRapport(budgetId, {
    query: { queryKey: getGetBudgetIdRapportQueryKey(budgetId) },
  });
  const { data: alertes } = useGetBudgetIdAlertes(budgetId, {
    query: { queryKey: getGetBudgetIdAlertesQueryKey(budgetId) },
  });

  const r = rapport as RapportBudget | undefined;
  const parCat  = r?.parCategorie ?? {};
  const lignesEn = (alertes ?? []) as LigneBudget[];

  const barData = CAT_ORDER.filter((cat) => parCat[cat]).map((cat) => ({
    name: (CAT_LABELS[cat] ?? cat)
      .replace("Charges d'exploitation", "Ch. exploit.")
      .replace("Charges d'achat",        "Ch. achat")
      .replace("Charges de personnel",   "Ch. personnel")
      .replace("Charges financières",    "Ch. financières")
      .replace("Investissements",        "Invest."),
    Prévisionnel: parCat[cat]?.totalPrev ?? 0,
    Réalisé:      parCat[cat]?.totalReel ?? 0,
  }));

  const tauxExecution = r?.tauxExecution ?? 0;
  const tauxCapped    = Math.min(tauxExecution, 100);

  return (
    <div className="space-y-6">
      {lignesEn.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-600" />
            <h3 className="font-semibold text-red-800 text-sm">Lignes en dépassement (&gt;10%)</h3>
          </div>
          <div className="space-y-2">
            {lignesEn.map((l) => {
              const prev = parseFloat(l.montant_previsionnel_fcfa ?? "0");
              const reel = parseFloat(l.montant_realise_fcfa      ?? "0");
              const pct  = prev > 0 ? ((reel - prev) / prev) * 100 : 0;
              return (
                <div key={l.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{l.libelle}</span>
                    <span className="text-xs text-gray-400 ml-2">{CAT_LABELS[l.categorie] ?? l.categorie}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500">Prévu : {FCFA(prev)}</span>
                    <span className="font-semibold text-gray-900">Réalisé : {FCFA(reel)}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                      +{pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target size={16} className="text-gray-500" />
          <h3 className="font-semibold text-gray-900">Taux d'exécution global du budget</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>0%</span>
              <span className="font-semibold text-gray-900">{tauxExecution.toFixed(1)}%</span>
              <span>100%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-4">
              <div
                className="h-4 rounded-full transition-all duration-700"
                style={{
                  width: `${tauxCapped}%`,
                  backgroundColor:
                    tauxExecution > 110 ? "#dc2626" : tauxExecution > 90 ? "#16a34a" : "#c4962a",
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {tauxExecution < 50
                ? "Début d'exécution"
                : tauxExecution < 90
                ? "En cours"
                : tauxExecution <= 110
                ? "Objectif atteint"
                : "Dépassement budgétaire"}
            </p>
          </div>
          <div className="w-24 text-center">
            <p
              className="text-3xl font-black"
              style={{
                color:
                  tauxExecution > 110 ? "#dc2626" : tauxExecution > 90 ? "#16a34a" : "#c4962a",
              }}
            >
              {tauxExecution.toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {barData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Prévisionnel vs Réalisé par catégorie</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} margin={{ top: 4, right: 16, left: 20, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1_000_000).toFixed(0) + "M"} />
              <Tooltip formatter={(v: number) => FCFA(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="Prévisionnel" fill="#d1d5db" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Réalisé"      fill="#1a4731" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {r && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Budget total prévisionnel</p>
            <p className="text-xl font-bold text-gray-900">{FCFA(r.totalPrev)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Budget total réalisé</p>
            <p className="text-xl font-bold text-gray-900">{FCFA(r.totalReel)}</p>
            <p className={`text-xs font-semibold mt-1 ${r.totalReel <= r.totalPrev ? "text-green-600" : "text-red-600"}`}>
              {r.totalReel <= r.totalPrev
                ? "Dans les limites"
                : "Dépassement : " + FCFA(r.totalReel - r.totalPrev)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────
type Onglet = "hypotheses" | "detail" | "suivi";

interface CampagneActive { id: number; nom: string; statut: string }

export default function BudgetPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const peutCreer = usePermission("budget", "creer");
  const [onglet, setOnglet]    = useState<Onglet>("hypotheses");
  const [budgetId, setBudgetId] = useState<number | null>(null);
  const [initDone, setInitDone] = useState(false);

  // ── 1. Récupère la campagne ouverte dynamiquement ───────────────────────────
  const { data: campagne, isLoading: campagneLoading, isError: campagneError } =
    useQuery<CampagneActive>({
      queryKey: ["campagne-active"],
      queryFn: () => apiFetchCampagne<CampagneActive>("/campagnes/active"),
      retry: false,
      staleTime: 5 * 60_000,
    });

  const campagneId = campagne?.id;

  // ── 2. Mutation créer/récupérer budget ──────────────────────────────────────
  const mutCreate = usePostBudgetCampagneId({
    mutation: {
      onSuccess: (data) => {
        setBudgetId(data.budget.id);
        if (campagneId) {
          queryClient.invalidateQueries({ queryKey: getGetBudgetCampagneIdQueryKey(campagneId) });
        }
      },
      onError: () => toast({ title: "Erreur initialisation budget", variant: "destructive" }),
    },
  });

  // ── 3. Auto-init : crée le budget si pas encore fait ─────────────────────────
  useEffect(() => {
    if (!initDone && peutCreer && campagneId) {
      setInitDone(true);
      mutCreate.mutate({ id: campagneId });
    }
  }, [initDone, peutCreer, campagneId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Charge le détail budget ───────────────────────────────────────────────
  const { data: budgetData, isLoading: budgetLoading } = useGetBudgetCampagneId(
    campagneId ?? 0,
    { query: { queryKey: getGetBudgetCampagneIdQueryKey(campagneId ?? 0), enabled: !!campagneId, retry: false } },
  );

  const detail = budgetData as BudgetDetail | undefined;
  const currentBudgetId = budgetId ?? detail?.budget.id;

  useEffect(() => {
    if (detail?.budget.id && !budgetId) {
      setBudgetId(detail.budget.id);
    }
  }, [detail?.budget.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = campagneLoading || (!!campagneId && budgetLoading && !detail);

  const tabs: { id: Onglet; label: string }[] = [
    { id: "hypotheses", label: "Hypothèses de campagne" },
    { id: "detail",     label: "Budget détaillé" },
    { id: "suivi",      label: "Suivi graphique" },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-green-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (campagneError || !campagneId) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <p className="text-gray-500 font-medium">Aucune campagne ouverte</p>
        <p className="text-gray-400 text-sm mt-1">
          Ouvrez ou créez une campagne depuis la page Campagnes pour gérer le budget.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Budget prévisionnel</h1>
        <p className="text-sm text-gray-500 mt-1">{campagne?.nom ?? ""} — Gestion et suivi budgétaire</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setOnglet(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              onglet === id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {onglet === "hypotheses" && currentBudgetId && (
        <OngletHypotheses budgetId={currentBudgetId} campagneId={campagneId} />
      )}
      {onglet === "detail" && detail && currentBudgetId && (
        <OngletBudgetDetail data={detail} budgetId={currentBudgetId} campagneId={campagneId} />
      )}
      {onglet === "suivi" && currentBudgetId && (
        <OngletSuivi budgetId={currentBudgetId} />
      )}

      {!detail && !budgetLoading && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-400 text-sm">Aucun budget pour cette campagne.</p>
          {peutCreer && (
            <button
              onClick={() => mutCreate.mutate({ id: campagneId })}
              className="mt-3 px-4 py-2 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: VERT }}
            >
              Créer le budget
            </button>
          )}
        </div>
      )}
    </div>
  );
}

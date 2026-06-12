import { useState, useEffect, type ReactNode } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import {
  useGetPrixActuel,
  usePostPrix,
  useGetPrixHistorique,
  useGetPrixAnalyseMarge,
  useGetPrixComparaison,
  useGetPrixTendance,
  useGetPrixConfig,
  usePutPrixConfig,
  useGetPrixAlertes,
  usePutPrixAlertesIdLu,
  usePostPrixDiffuserSms,
  useGetPrixSimulation,
  useListCampagnes,
  getGetPrixActuelQueryKey,
  getGetPrixHistoriqueQueryKey,
  getGetPrixTendanceQueryKey,
  getGetPrixAlertesQueryKey,
  getGetPrixConfigQueryKey,
  getGetPrixSimulationQueryKey,
  type HistoriquePrix,
  type AlertePrix,
  type ConfigPrix,
  type LotMarge,
  type ComparaisonCampagne,
  type TendancePrix,
  type AnalyseMarge,
  type Campagne,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Plus, Send, Bell, Settings,
  AlertTriangle, CheckCircle2, X, ChevronUp, ChevronDown, BarChart2,
} from "lucide-react";

const VERT = "#1a4731";
const FCFA = (n: number | string | null | undefined) =>
  n != null ? `${Number(n).toLocaleString("fr-FR")} FCFA` : "—";

type Onglet = "temps-reel" | "evolution" | "marges" | "alertes";

// ─── Indicateur tendance ──────────────────────────────────────────────────────
function TendanceIcon({ direction, pct }: { direction: string; pct: number }) {
  if (direction === "hausse") return (
    <span className="flex items-center gap-1 text-green-600 font-semibold text-sm">
      <TrendingUp size={16} /> +{pct}%
    </span>
  );
  if (direction === "baisse") return (
    <span className="flex items-center gap-1 text-red-600 font-semibold text-sm">
      <TrendingDown size={16} /> {pct}%
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-gray-500 font-semibold text-sm">
      <Minus size={16} /> {pct}%
    </span>
  );
}

// ─── Modal : Saisir prix ──────────────────────────────────────────────────────
function ModalSaisirPrix({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    datePrix: today,
    prixBordChampFcfa: "",
    prixVenteExportFcfa: "",
    source: "manuel",
  });

  const { data: rawCampagnes } = useListCampagnes();
  const campagnes = (rawCampagnes as Campagne[] | undefined) ?? [];
  const campagneActive = campagnes.find((c) => c.statut === "ouverte") ?? null;

  const mut = usePostPrix({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPrixActuelQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPrixHistoriqueQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPrixTendanceQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPrixAlertesQueryKey() });
        toast({ title: "Prix enregistré ✓" });
        onClose();
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  const prix = parseInt(form.prixBordChampFcfa) || 0;
  const prixExport = parseInt(form.prixVenteExportFcfa) || 0;
  const marge = prixExport - prix;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-lg">Mettre à jour le prix</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Campagne active */}
          <div className={`rounded-lg px-3 py-2.5 text-sm flex items-center gap-2 ${campagneActive ? "bg-green-50 border border-green-100" : "bg-amber-50 border border-amber-100"}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${campagneActive ? "bg-green-500" : "bg-amber-400"}`} />
            {campagneActive
              ? <span className="text-green-800">Campagne <strong>{campagneActive.libelle}</strong> — ce prix y sera rattaché automatiquement.</span>
              : <span className="text-amber-800">Aucune campagne ouverte — le prix sera enregistré sans campagne.</span>
            }
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={form.datePrix}
              onChange={(e) => setForm((f) => ({ ...f, datePrix: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prix bord champ (FCFA/kg) *</label>
              <MoneyInput value={form.prixBordChampFcfa}
                onChange={(raw) => setForm((f) => ({ ...f, prixBordChampFcfa: raw }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="1 050" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prix vente export (FCFA/kg) *</label>
              <MoneyInput value={form.prixVenteExportFcfa}
                onChange={(raw) => setForm((f) => ({ ...f, prixVenteExportFcfa: raw }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="1 380" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
            <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="manuel">Manuel</option>
              <option value="DGA">DGA</option>
              <option value="CONSEIL CAFE CACAO">Conseil Café Cacao</option>
            </select>
          </div>
          {prix > 0 && prixExport > 0 && (
            <div className={`rounded-lg p-3 text-center text-sm font-semibold ${marge >= 100 ? "bg-green-50 text-green-700" : marge >= 0 ? "bg-orange-50 text-orange-700" : "bg-red-50 text-red-700"}`}>
              Marge brute : {FCFA(marge)} / kg
              {marge < 0 && " ⚠️ Marge négative !"}
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
          <button
            onClick={() => mut.mutate({ data: {
              datePrix: form.datePrix,
              prixBordChampFcfa: parseInt(form.prixBordChampFcfa),
              prixVenteExportFcfa: parseInt(form.prixVenteExportFcfa),
              source: form.source,
            }})}
            disabled={mut.isPending || !form.prixBordChampFcfa || !form.prixVenteExportFcfa}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: VERT }}>
            {mut.isPending ? "Enregistrement…" : "Enregistrer le prix"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal : Diffuser SMS ─────────────────────────────────────────────────────
function ModalDiffuserSMS({ prix, onClose }: { prix: HistoriquePrix; onClose: () => void }) {
  const { toast } = useToast();
  const mut = usePostPrixDiffuserSms({
    mutation: {
      onSuccess: (data) => {
        const d = data as { envoyes?: number; echecs?: number };
        toast({ title: `SMS envoyés : ${d.envoyes ?? 0} succès, ${d.echecs ?? 0} échec(s)` });
        onClose();
      },
      onError: () => toast({ title: "Erreur SMS", variant: "destructive" }),
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Diffuser par SMS</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">
            <p className="font-medium mb-2">Message qui sera envoyé :</p>
            <p className="italic text-gray-600">
              « Prix bord champ au {new Date(prix.datePrix).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} : {parseFloat(prix.prixBordChampFcfa).toLocaleString("fr-FR")} FCFA/kg. Votre coopérative CoopDigital. »
            </p>
          </div>
          <p className="text-xs text-gray-400">Ce message sera envoyé à tous les membres actifs disposant d'un numéro de téléphone.</p>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
          <button
            onClick={() => mut.mutate({ data: { prix: parseFloat(prix.prixBordChampFcfa), date: prix.datePrix } })}
            disabled={mut.isPending}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: VERT }}>
            <Send size={14} /> {mut.isPending ? "Envoi…" : "Confirmer l'envoi"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet 1 : Prix en temps réel ───────────────────────────────────────────
function OngletTempsReel() {
  const peutSaisir    = usePermission("prix", "saisir_prix");
  const peutDiffuser  = usePermission("prix", "diffuser_sms");
  const peutAnalyser  = usePermission("prix", "voir_analyse");

  const [showModalSaisie, setShowModalSaisie]   = useState(false);
  const [showModalSMS,    setShowModalSMS]       = useState(false);
  const [simPrix, setSimPrix]                   = useState("");

  const { data: actuel }    = useGetPrixActuel();
  const { data: tendance }  = useGetPrixTendance();
  const simPrixNum = simPrix ? parseInt(simPrix) : 0;
  const { data: simulation } = useGetPrixSimulation(
    { prixHypothetique: simPrixNum || 1 },
    { query: { queryKey: getGetPrixSimulationQueryKey({ prixHypothetique: simPrixNum || 1 }), enabled: simPrixNum > 0 } },
  );

  const hp = actuel as HistoriquePrix | null;
  const t  = tendance as TendancePrix | null;
  const sim = simulation as { prixVenteReference?: number; chargesEstimees?: number; margeSimulee?: number; rentabilite?: string } | null;

  const prixActuel       = hp ? parseFloat(hp.prixBordChampFcfa) : null;
  const prixExportActuel = hp ? parseFloat(hp.prixVenteExportFcfa) : null;
  const margeActuelle    = hp?.margeBruteKgFcfa ? parseFloat(hp.margeBruteKgFcfa) : null;

  const dateStr = hp
    ? (() => {
        const d = new Date(hp.datePrix);
        const today = new Date();
        const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
        if (diff === 0) return `aujourd'hui`;
        if (diff === 1) return "hier";
        return `le ${d.toLocaleDateString("fr-FR")}`;
      })()
    : "—";

  return (
    <div className="space-y-5">
      {/* ─ Grande carte prix bord champ ─ */}
      <div className="rounded-2xl text-white p-6 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${VERT} 0%, #2d7a53 100%)` }}>
        <div className="relative z-10">
          <p className="text-green-200 text-xs font-semibold uppercase tracking-widest mb-1">Prix bord champ actuel</p>
          <div className="flex items-end gap-4 mb-2">
            <span className="text-5xl font-bold">
              {prixActuel != null ? prixActuel.toLocaleString("fr-FR") : "—"}
            </span>
            <span className="text-xl text-green-200 mb-1">FCFA / kg</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            {t && <TendanceIcon direction={t.direction} pct={t.variationSemainePct} />}
            <span className="text-green-300 text-xs">vs semaine dernière</span>
          </div>
          <p className="text-green-300 text-xs">Mise à jour : {dateStr}{hp?.source ? ` · Source : ${hp.source}` : ""}</p>
        </div>
        {/* Cercle décoratif */}
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-10 bg-white" />
        <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-10 bg-white" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ─ Carte marge ─ */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Marge actuelle</h3>
          <div className="space-y-2.5">
            {[
              { label: "Prix vente export", value: prixExportActuel, color: "text-blue-700" },
              { label: "Prix bord champ", value: prixActuel != null ? -prixActuel : null, display: prixActuel, color: "text-orange-700", prefix: "−" },
            ].map(({ label, value, display, color, prefix }) => (
              <div key={label} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                <span className="text-sm text-gray-600">{label}</span>
                <span className={`text-sm font-semibold ${color}`}>
                  {prefix}{FCFA(display ?? value)}/kg
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2">
              <span className="text-sm font-bold text-gray-900">Marge brute</span>
              <span className={`text-base font-bold ${margeActuelle != null && margeActuelle >= 100 ? "text-green-700" : margeActuelle != null && margeActuelle >= 0 ? "text-orange-600" : "text-red-700"}`}>
                {margeActuelle != null ? `${margeActuelle.toLocaleString("fr-FR")} FCFA/kg` : "—"}
                {margeActuelle != null && margeActuelle >= 100 && " ✅"}
                {margeActuelle != null && margeActuelle >= 0 && margeActuelle < 100 && " ⚠️"}
                {margeActuelle != null && margeActuelle < 0 && " 🔴"}
              </span>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {peutSaisir && (
              <button onClick={() => setShowModalSaisie(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-white rounded-lg"
                style={{ backgroundColor: VERT }}>
                <Plus size={13} /> Mettre à jour
              </button>
            )}
            {peutDiffuser && hp && (
              <button onClick={() => setShowModalSMS(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
                <Send size={13} /> Diffuser par SMS
              </button>
            )}
          </div>
        </div>

        {/* ─ Simulation ─ */}
        {peutAnalyser && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-1">Simulateur de marge</h3>
            <p className="text-xs text-gray-400 mb-3">Si le prix bord champ change, quelle serait votre marge ?</p>
            <div className="flex gap-2 mb-3">
              <MoneyInput value={simPrix} onChange={(raw) => setSimPrix(raw)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Prix hypothétique (FCFA/kg)" />
            </div>
            {sim && simPrix && (
              <div className={`rounded-lg p-4 space-y-2 ${sim.rentabilite === "bonne" ? "bg-green-50 border border-green-100" : sim.rentabilite === "faible" ? "bg-orange-50 border border-orange-100" : "bg-red-50 border border-red-100"}`}>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Prix vente référence</span>
                  <span className="font-medium">{FCFA(sim.prixVenteReference)}/kg</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Charges estimées</span>
                  <span className="font-medium">−{FCFA(sim.chargesEstimees)}/kg</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-current/20 pt-2">
                  <span>Marge simulée</span>
                  <span className={sim.rentabilite === "bonne" ? "text-green-700" : sim.rentabilite === "faible" ? "text-orange-700" : "text-red-700"}>
                    {FCFA(sim.margeSimulee)}/kg
                  </span>
                </div>
                <p className="text-xs font-semibold text-center">
                  {sim.rentabilite === "bonne" ? "✅ Marge satisfaisante" : sim.rentabilite === "faible" ? "⚠️ Marge faible" : "🔴 Marge négative — attention !"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {showModalSaisie && <ModalSaisirPrix onClose={() => setShowModalSaisie(false)} />}
      {showModalSMS && hp && <ModalDiffuserSMS prix={hp} onClose={() => setShowModalSMS(false)} />}
    </div>
  );
}

// ─── Onglet 2 : Évolution & tendances ────────────────────────────────────────
function OngletEvolution() {
  const [periode, setPeriode] = useState<"30" | "90" | "180" | "365" | "all">("90");

  const { data: rawHistorique } = useGetPrixHistorique(
    periode !== "all" ? { limit: parseInt(periode) } : {},
  );
  const { data: rawComparaison } = useGetPrixComparaison();

  const historique = (rawHistorique as HistoriquePrix[] | undefined) ?? [];
  const comparaison = (rawComparaison as ComparaisonCampagne[] | undefined) ?? [];

  const latestByDate = new Map<string, HistoriquePrix>();
  for (const h of historique) {
    const existing = latestByDate.get(h.datePrix);
    if (!existing || (h.id ?? 0) > (existing.id ?? 0)) {
      latestByDate.set(h.datePrix, h);
    }
  }
  const chartData = [...latestByDate.values()]
    .sort((a, b) => a.datePrix.localeCompare(b.datePrix))
    .map((h) => ({
      date: new Date(h.datePrix).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
      bordChamp:  Math.round(parseFloat(h.prixBordChampFcfa)),
      export:     Math.round(parseFloat(h.prixVenteExportFcfa)),
      marge:      h.margeBruteKgFcfa ? Math.round(parseFloat(h.margeBruteKgFcfa)) : 0,
    }));

  const { data: tendance } = useGetPrixTendance();
  const t = tendance as TendancePrix | null;

  return (
    <div className="space-y-5">
      {/* KPIs tendance */}
      {t && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Direction", value: t.direction === "hausse" ? "↑ Hausse" : t.direction === "baisse" ? "↓ Baisse" : "→ Stable", color: t.direction === "hausse" ? "text-green-700" : t.direction === "baisse" ? "text-red-700" : "text-gray-600" },
            { label: "Moyenne mobile (4 sem.)", value: `${t.moyenneMobile.toLocaleString("fr-FR")} FCFA/kg`, color: "text-gray-900" },
            { label: "Variation semaine", value: `${t.variationSemainePct > 0 ? "+" : ""}${t.variationSemainePct}%`, color: t.variationSemainePct > 0 ? "text-green-700" : t.variationSemainePct < 0 ? "text-red-700" : "text-gray-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sélecteur période */}
      <div className="flex gap-2 bg-gray-100 rounded-xl p-1 w-fit">
        {([["30","30j"],["90","3 mois"],["180","6 mois"],["365","1 an"],["all","Tout"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setPeriode(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${periode === v ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Graphique cours */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Évolution des prix et marges</h3>
        {chartData.length === 0
          ? <p className="text-gray-400 text-sm text-center py-12">Aucune donnée pour cette période</p>
          : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v: number, name: string) => [`${v.toLocaleString("fr-FR")} FCFA/kg`, name === "bordChamp" ? "Bord champ" : name === "export" ? "Vente export" : "Marge"]}
                />
                <Area dataKey="marge" fill="#bbf7d0" stroke="none" name="Marge" />
                <Line dataKey="bordChamp" stroke="#f97316" strokeWidth={2} dot={false} name="Bord champ" />
                <Line dataKey="export" stroke={VERT} strokeWidth={2} dot={false} name="Vente export" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        <div className="flex items-center gap-6 mt-3 justify-center text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-orange-400 inline-block"></span> Bord champ</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block" style={{ backgroundColor: VERT }}></span> Vente export</span>
          <span className="flex items-center gap-1"><span className="w-4 h-3 bg-green-200 inline-block rounded"></span> Marge</span>
        </div>
      </div>

      {/* Tableau comparatif campagnes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Comparaison par campagne</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-3 text-left">Campagne</th>
              <th className="px-4 py-3 text-right">Prix achat moy.</th>
              <th className="px-4 py-3 text-right">Prix vente moy.</th>
              <th className="px-4 py-3 text-right">Marge moy.</th>
              <th className="px-4 py-3 text-right">Tonnage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {comparaison.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Aucune donnée</td></tr>
            )}
            {comparaison.map((c) => {
              const margeNum = c.marge_moy ? Math.round(parseFloat(c.marge_moy)) : null;
              return (
                <tr key={c.campagne_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.libelle}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {c.prix_achat_moy ? `${Math.round(parseFloat(c.prix_achat_moy)).toLocaleString("fr-FR")} FCFA/kg` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {c.prix_vente_moy ? `${Math.round(parseFloat(c.prix_vente_moy)).toLocaleString("fr-FR")} FCFA/kg` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${margeNum != null && margeNum >= 100 ? "text-green-700" : margeNum != null && margeNum >= 0 ? "text-orange-600" : "text-red-700"}`}>
                      {margeNum != null ? `${margeNum.toLocaleString("fr-FR")} FCFA/kg` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {c.tonnage_total ? `${parseFloat(c.tonnage_total).toFixed(1)} T` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Onglet 3 : Analyse de marge par lot ─────────────────────────────────────
function OngletMarges() {
  const { data: rawAnalyse } = useGetPrixAnalyseMarge({});
  const analyse = rawAnalyse as AnalyseMarge | undefined;

  const lots = analyse?.lots ?? [];

  // Graphique barres top 15
  const chartData = lots.slice(0, 15).map((l) => ({
    name: `V${l.venteId}`,
    marge: l.margeKg,
    exportateur: l.exportateur,
  }));

  const RENT_COLORS: Record<string, string> = {
    bonne: "#16a34a",
    faible: "#f97316",
    negative: "#dc2626",
  };

  return (
    <div className="space-y-5">
      {/* KPIs top/bottom */}
      {analyse && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <p className="text-xs font-medium text-green-700 mb-1">🏆 Lot le plus rentable</p>
            {analyse.meilleurLot ? (
              <>
                <p className="font-bold text-green-900">Vente #{analyse.meilleurLot.venteId}</p>
                <p className="text-sm text-green-700">{analyse.meilleurLot.exportateur} · {analyse.meilleurLot.margeKg.toLocaleString("fr-FR")} FCFA/kg</p>
              </>
            ) : <p className="text-gray-400 text-sm">—</p>}
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
            <p className="text-xs font-medium text-blue-700 mb-1">Marge moyenne</p>
            <p className="text-2xl font-bold text-blue-900">
              {analyse.margesMoyenne.toLocaleString("fr-FR")} FCFA/kg
            </p>
          </div>
          <div className={`rounded-xl p-4 border ${analyse.moinsRentable && analyse.moinsRentable.margeKg < 0 ? "bg-red-50 border-red-100" : "bg-orange-50 border-orange-100"}`}>
            <p className={`text-xs font-medium mb-1 ${analyse.moinsRentable && analyse.moinsRentable.margeKg < 0 ? "text-red-700" : "text-orange-700"}`}>
              {analyse.moinsRentable && analyse.moinsRentable.margeKg < 0 ? "🔴 Marge négative" : "⚠️ Lot le moins rentable"}
            </p>
            {analyse.moinsRentable ? (
              <>
                <p className={`font-bold ${analyse.moinsRentable.margeKg < 0 ? "text-red-900" : "text-orange-900"}`}>Vente #{analyse.moinsRentable.venteId}</p>
                <p className={`text-sm ${analyse.moinsRentable.margeKg < 0 ? "text-red-700" : "text-orange-700"}`}>{analyse.moinsRentable.exportateur} · {analyse.moinsRentable.margeKg.toLocaleString("fr-FR")} FCFA/kg</p>
              </>
            ) : <p className="text-gray-400 text-sm">—</p>}
          </div>
        </div>
      )}

      {/* Graphique barres */}
      {lots.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Marge par lot (FCFA/kg) — Top 15</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v: number) => [`${v.toLocaleString("fr-FR")} FCFA/kg`, "Marge"]}
              />
              <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 2" />
              <Bar dataKey="marge" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.marge >= 100 ? VERT : entry.marge >= 0 ? "#f97316" : "#dc2626"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tableau détail */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Détail des lots vendus</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-3 text-left">Vente</th>
                <th className="px-4 py-3 text-left">Exportateur</th>
                <th className="px-4 py-3 text-right">Poids</th>
                <th className="px-4 py-3 text-right">Achat</th>
                <th className="px-4 py-3 text-right">Vente</th>
                <th className="px-4 py-3 text-right">Charges</th>
                <th className="px-4 py-3 text-right">Marge/kg</th>
                <th className="px-4 py-3 text-right">Marge totale</th>
                <th className="px-4 py-3 text-center">Rentabilité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lots.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">Aucune vente enregistrée</td></tr>
              )}
              {lots.map((l) => (
                <tr key={l.venteId} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">#{l.venteId}</td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-[120px] truncate">{l.exportateur}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{l.poidsKg.toLocaleString("fr-FR")} kg</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{l.prixAchatMoyenKg.toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{l.prixVenteKg.toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{l.chargesEstimeesKg.toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: RENT_COLORS[l.rentabilite] }}>
                    {l.margeKg.toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-700">
                    {l.margeTotale.toLocaleString("fr-FR")} FCFA
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      l.rentabilite === "bonne" ? "bg-green-100 text-green-700" :
                      l.rentabilite === "faible" ? "bg-orange-100 text-orange-700" :
                      "bg-red-100 text-red-700"}`}>
                      {l.rentabilite === "bonne" ? "✓ Bonne" : l.rentabilite === "faible" ? "⚠ Faible" : "✗ Négative"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet 4 : Alertes & configuration ──────────────────────────────────────
function OngletAlertes() {
  const peutConfigurer = usePermission("prix", "configurer");
  const queryClient    = useQueryClient();
  const { toast }      = useToast();

  const { data: rawAlertes } = useGetPrixAlertes({});
  const { data: rawConfig  } = useGetPrixConfig();

  const alertes = (rawAlertes as AlertePrix[] | undefined) ?? [];
  const config  = rawConfig as ConfigPrix | null;

  const [form, setForm] = useState({
    seuilMargeMinimumFcfa:    "",
    seuilVariationAlertePct:  "",
    diffusionAutoSms:         false,
  });

  useEffect(() => {
    if (config) {
      setForm({
        seuilMargeMinimumFcfa:   config.seuilMargeMinimumFcfa   ?? "100",
        seuilVariationAlertePct: config.seuilVariationAlertePct ?? "10",
        diffusionAutoSms:        config.diffusionAutoSms,
      });
    }
  }, [config]);

  const mutConfig = usePutPrixConfig({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPrixConfigQueryKey() });
        toast({ title: "Configuration mise à jour ✓" });
      },
    },
  });

  const mutLue = usePutPrixAlertesIdLu({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetPrixAlertesQueryKey() }),
    },
  });

  const ALERTE_LABELS: Record<string, { label: string; cls: string }> = {
    marge_faible:    { label: "Marge faible",     cls: "bg-orange-100 text-orange-700" },
    prix_bas:        { label: "Prix bas",          cls: "bg-red-100 text-red-700"    },
    prix_eleve:      { label: "Prix élevé",        cls: "bg-blue-100 text-blue-700"  },
    variation_forte: { label: "Variation forte",   cls: "bg-purple-100 text-purple-700" },
  };

  const nonLues = alertes.filter((a) => !a.lu).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Alertes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Bell size={16} style={{ color: VERT }} />
            Alertes prix
            {nonLues > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{nonLues}</span>
            )}
          </h3>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
          {alertes.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-10 px-4">Aucune alerte</p>
          )}
          {alertes.map((a) => {
            const badge = ALERTE_LABELS[a.type] ?? { label: a.type, cls: "bg-gray-100 text-gray-700" };
            return (
              <div key={a.id} className={`px-4 py-3 flex items-start gap-3 ${a.lu ? "opacity-50" : ""}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(a.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    </span>
                    {!a.lu && <span className="w-2 h-2 bg-red-500 rounded-full" />}
                  </div>
                  <p className="text-sm text-gray-700">{a.message}</p>
                </div>
                {!a.lu && (
                  <button onClick={() => mutLue.mutate({ id: a.id })}
                    className="shrink-0 text-xs text-gray-400 hover:text-gray-600 mt-1">
                    <CheckCircle2 size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Configuration */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Settings size={16} style={{ color: VERT }} /> Configuration des seuils
        </h3>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Marge minimum (FCFA/kg)</label>
            <MoneyInput value={form.seuilMargeMinimumFcfa}
              onChange={(raw) => setForm((f) => ({ ...f, seuilMargeMinimumFcfa: raw }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
            <p className="text-xs text-gray-400 mt-1">Une alerte est créée si la marge brute est en dessous de ce seuil</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Seuil de variation (%)</label>
            <input type="number" value={form.seuilVariationAlertePct}
              onChange={(e) => setForm((f) => ({ ...f, seuilVariationAlertePct: e.target.value }))}
              disabled={!peutConfigurer}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
            <p className="text-xs text-gray-400 mt-1">Alerte si variation du prix &gt; ce pourcentage</p>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">Diffusion SMS automatique</p>
              <p className="text-xs text-gray-400">Envoyer un SMS à tous les membres lors de chaque mise à jour de prix</p>
            </div>
            <button
              disabled={!peutConfigurer}
              onClick={() => setForm((f) => ({ ...f, diffusionAutoSms: !f.diffusionAutoSms }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.diffusionAutoSms ? "bg-green-600" : "bg-gray-200"} disabled:opacity-50`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.diffusionAutoSms ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          {peutConfigurer && (
            <button
              onClick={() => mutConfig.mutate({ data: {
                seuilMargeMinimumFcfa:   parseFloat(form.seuilMargeMinimumFcfa)   || undefined,
                seuilVariationAlertePct: parseFloat(form.seuilVariationAlertePct) || undefined,
                diffusionAutoSms: form.diffusionAutoSms,
              }})}
              disabled={mutConfig.isPending}
              className="w-full py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: VERT }}>
              {mutConfig.isPending ? "Enregistrement…" : "Sauvegarder la configuration"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function PrixPage() {
  const [onglet, setOnglet] = useState<Onglet>("temps-reel");

  const { data: alertes } = useGetPrixAlertes({ nonLues: true });
  const nbAlertes = (alertes as AlertePrix[] | undefined)?.length ?? 0;

  const tabs: { id: Onglet; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "temps-reel", label: "Prix en temps réel", icon: <TrendingUp size={15} /> },
    { id: "evolution",  label: "Évolution & tendances", icon: <BarChart2 size={15} /> },
    { id: "marges",     label: "Analyse de marge", icon: <ChevronUp size={15} /> },
    { id: "alertes",    label: "Alertes & config", icon: <Bell size={15} />, badge: nbAlertes },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suivi des Prix</h1>
        <p className="text-sm text-gray-500 mt-1">Prix bord champ, marges, tendances et alertes</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit flex-wrap">
        {tabs.map(({ id, label, icon, badge }) => (
          <button key={id} onClick={() => setOnglet(id)}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              onglet === id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}>
            {icon} {label}
            {badge != null && badge > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">{badge}</span>
            )}
          </button>
        ))}
      </div>

      {onglet === "temps-reel" && <OngletTempsReel />}
      {onglet === "evolution"  && <OngletEvolution />}
      {onglet === "marges"     && <OngletMarges />}
      {onglet === "alertes"    && <OngletAlertes />}
    </div>
  );
}


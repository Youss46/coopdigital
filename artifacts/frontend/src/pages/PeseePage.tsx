import { useState } from "react";
import {
  useGetBalances,
  useGetBalancesAlertes,
  useCreateBalance,
  useUpdateBalance,
  useCreateVerificationBalance,
  useGetLitiges,
  useResoudreLitige,
  useGetStatistiquesPesee,
  useGetConfigPesee,
  useUpdateConfigPesee,
  getGetBalancesQueryKey,
  getGetLitigesQueryKey,
  getGetStatistiquesPeseeQueryKey,
  getGetConfigPeseeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Scale, AlertTriangle, BarChart3, Settings, CheckCircle2, Clock, Wrench, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Tab = "balances" | "litiges" | "stats";

const STATUT_LABELS: Record<string, string> = {
  actif: "Actif",
  inactif: "Inactif",
  maintenance: "Maintenance",
  hors_service: "Hors service",
};

const STATUT_COLORS: Record<string, string> = {
  actif: "bg-green-100 text-green-800",
  inactif: "bg-gray-100 text-gray-600",
  maintenance: "bg-yellow-100 text-yellow-800",
  hors_service: "bg-red-100 text-red-800",
};

const LITIGE_STATUT_LABELS: Record<string, string> = {
  ouvert: "Ouvert",
  en_cours: "En cours",
  resolu: "Résolu",
  annule: "Annulé",
};
const LITIGE_STATUT_COLORS: Record<string, string> = {
  ouvert: "bg-red-100 text-red-800",
  en_cours: "bg-yellow-100 text-yellow-800",
  resolu: "bg-green-100 text-green-800",
  annule: "bg-gray-100 text-gray-600",
};

export default function PeseePage() {
  const [tab, setTab] = useState<Tab>("balances");
  const qc = useQueryClient();
  const { toast } = useToast();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pesée</h1>
        <p className="text-gray-500 text-sm mt-0.5">Gestion des balances, litiges de pesée et statistiques</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(["balances", "litiges", "stats"] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = { balances: "Balances", litiges: "Litiges", stats: "Statistiques" };
          const icons: Record<Tab, React.ReactNode> = {
            balances: <Scale size={14} />,
            litiges: <AlertTriangle size={14} />,
            stats: <BarChart3 size={14} />,
          };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {icons[t]}
              {labels[t]}
            </button>
          );
        })}
      </div>

      {tab === "balances" && <BalancesTab qc={qc} toast={toast} />}
      {tab === "litiges" && <LitigesTab qc={qc} toast={toast} />}
      {tab === "stats" && <StatsTab qc={qc} toast={toast} />}
    </div>
  );
}

// ─── Balances ─────────────────────────────────────────────────────────────────

function BalancesTab({ qc, toast }: { qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const { data: alertesData } = useGetBalancesAlertes();
  const { data: balancesData, isLoading } = useGetBalances();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [verifBalanceId, setVerifBalanceId] = useState<number | null>(null);

  const createMutation = useCreateBalance({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
        setShowForm(false);
        toast({ title: "Balance créée" });
      },
    },
  });
  const updateMutation = useUpdateBalance({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
        setEditId(null);
        toast({ title: "Balance mise à jour" });
      },
    },
  });

  const alertes = alertesData?.alertes ?? [];

  return (
    <div className="space-y-4">
      {alertes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
            <AlertTriangle size={15} />
            {alertes.length} balance{alertes.length > 1 ? "s" : ""} nécessite{alertes.length === 1 ? "" : "nt"} une vérification
          </div>
          {alertes.map((a) => (
            <div key={a.id} className="text-xs text-amber-700">
              {a.marque ?? "Balance"} — {a.site ?? "site inconnu"} (prévu : {a.date_prochaine_verification ? String(a.date_prochaine_verification) : "—"})
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">{balancesData?.balances?.length ?? 0} balance(s) enregistrée(s)</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: "#1a4731" }}
        >
          <Plus size={14} />
          Nouvelle balance
        </button>
      </div>

      {showForm && (
        <BalanceForm
          onCancel={() => setShowForm(false)}
          onSubmit={(d) => createMutation.mutate({ data: d })}
          loading={createMutation.isPending}
        />
      )}

      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Chargement…</div>
      ) : (
        <div className="space-y-3">
          {(balancesData?.balances ?? []).map((b) => (
            <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4">
              {editId === b.id ? (
                <BalanceForm
                  initial={b}
                  onCancel={() => setEditId(null)}
                  onSubmit={(d) => updateMutation.mutate({ id: b.id, data: d })}
                  loading={updateMutation.isPending}
                />
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Scale size={14} className="text-gray-400" />
                        <span className="font-semibold text-sm text-gray-900">
                          {b.marque ?? "Balance"} {b.numero_serie ? `#${b.numero_serie}` : ""}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[b.statut ?? "actif"] ?? ""}`}>
                          {STATUT_LABELS[b.statut ?? "actif"] ?? b.statut}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                        {b.site && <div>Site : {b.site}</div>}
                        {b.capacite_max_kg && <div>Capacité : {b.capacite_max_kg} kg</div>}
                        {b.precision_g && <div>Précision : ±{b.precision_g} g</div>}
                        {b.date_derniere_verification && <div className="flex items-center gap-1"><CheckCircle2 size={11} className="text-green-500" />Vérifiée : {String(b.date_derniere_verification)}</div>}
                        {b.date_prochaine_verification && <div className="flex items-center gap-1"><Clock size={11} className="text-amber-500" />Prochaine vérif. : {String(b.date_prochaine_verification)}</div>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setVerifBalanceId(b.id)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                        <Wrench size={11} />
                        Vérif.
                      </button>
                      <button onClick={() => setEditId(b.id)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50">
                        Modifier
                      </button>
                    </div>
                  </div>
                  {verifBalanceId === b.id && (
                    <VerificationForm
                      balanceId={b.id}
                      onCancel={() => setVerifBalanceId(null)}
                      onSuccess={() => {
                        qc.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
                        setVerifBalanceId(null);
                        toast({ title: "Vérification enregistrée" });
                      }}
                    />
                  )}
                </>
              )}
            </div>
          ))}
          {(balancesData?.balances ?? []).length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              <Scale size={32} className="mx-auto mb-2 opacity-30" />
              Aucune balance enregistrée
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type BalanceInitial = {
  numero_serie?: string | null;
  marque?: string | null;
  capacite_max_kg?: number | null;
  precision_g?: number | null;
  site?: string | null;
  statut?: string;
  date_acquisition?: Date | string | null;
  date_prochaine_verification?: Date | string | null;
};

type BalanceFormData = {
  statut: string;
  marque?: string;
  numero_serie?: string;
  capacite_max_kg?: number;
  precision_g?: number;
  site?: string;
  date_acquisition?: string;
  date_prochaine_verification?: string;
};

function BalanceForm({
  initial,
  onCancel,
  onSubmit,
  loading,
}: {
  initial?: BalanceInitial;
  onCancel: () => void;
  onSubmit: (d: BalanceFormData) => void;
  loading: boolean;
}) {
  const [marque, setMarque] = useState(String(initial?.marque ?? ""));
  const [numeroSerie, setNumeroSerie] = useState(String(initial?.numero_serie ?? ""));
  const [capaciteMaxKg, setCapaciteMaxKg] = useState(String(initial?.capacite_max_kg ?? ""));
  const [precisionG, setPrecisionG] = useState(String(initial?.precision_g ?? ""));
  const [site, setSite] = useState(String(initial?.site ?? ""));
  const [statut, setStatut] = useState(String(initial?.statut ?? "actif"));
  const [dateAcquisition, setDateAcquisition] = useState(String(initial?.date_acquisition ?? ""));
  const [dateProchainVerification, setDateProchainVerification] = useState(String(initial?.date_prochaine_verification ?? ""));

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="font-semibold text-sm text-gray-900">{initial ? "Modifier la balance" : "Nouvelle balance"}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Marque</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={marque} onChange={e => setMarque(e.target.value)} placeholder="KERN, METTLER…" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">N° série</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={numeroSerie} onChange={e => setNumeroSerie(e.target.value)} placeholder="SN-001" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Capacité max (kg)</label>
          <input type="number" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={capaciteMaxKg} onChange={e => setCapaciteMaxKg(e.target.value)} placeholder="500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Précision (g)</label>
          <input type="number" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={precisionG} onChange={e => setPrecisionG(e.target.value)} placeholder="50" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Site</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={site} onChange={e => setSite(e.target.value)} placeholder="Magasin central" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Statut</label>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={statut} onChange={e => setStatut(e.target.value)}>
            <option value="actif">Actif</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactif">Inactif</option>
            <option value="hors_service">Hors service</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date d'acquisition</label>
          <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={dateAcquisition} onChange={e => setDateAcquisition(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Prochaine vérification</label>
          <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={dateProchainVerification} onChange={e => setDateProchainVerification(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
        <button
          type="button"
          disabled={loading}
          onClick={() => onSubmit({
            marque: marque || undefined,
            numero_serie: numeroSerie || undefined,
            capacite_max_kg: capaciteMaxKg ? parseFloat(capaciteMaxKg) : undefined,
            precision_g: precisionG ? parseFloat(precisionG) : undefined,
            site: site || undefined,
            statut,
            date_acquisition: dateAcquisition || undefined,
            date_prochaine_verification: dateProchainVerification || undefined,
          })}
          className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "#1a4731" }}
        >
          {loading ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function VerificationForm({
  balanceId,
  onCancel,
  onSuccess,
}: {
  balanceId: number;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [dateVerification, setDateVerification] = useState(new Date().toISOString().split("T")[0]!);
  const [verificateur, setVerificateur] = useState("");
  const [resultat, setResultat] = useState("conforme");
  const [ecartMesureG, setEcartMesureG] = useState("");
  const [observations, setObservations] = useState("");
  const [prochaineVerification, setProchaineVerification] = useState("");

  const mutation = useCreateVerificationBalance({ mutation: { onSuccess } });

  return (
    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
      <h4 className="font-semibold text-sm text-blue-900 flex items-center gap-1"><Wrench size={13} />Nouvelle vérification</h4>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
          <input type="date" required className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" value={dateVerification} onChange={e => setDateVerification(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Résultat *</label>
          <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" value={resultat} onChange={e => setResultat(e.target.value)}>
            <option value="conforme">Conforme</option>
            <option value="non_conforme">Non conforme</option>
            <option value="reglage_effectue">Réglage effectué</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Vérificateur</label>
          <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" value={verificateur} onChange={e => setVerificateur(e.target.value)} placeholder="Nom…" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Écart mesuré (g)</label>
          <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" value={ecartMesureG} onChange={e => setEcartMesureG(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Prochaine vérification</label>
          <input type="date" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" value={prochaineVerification} onChange={e => setProchaineVerification(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Observations</label>
          <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" value={observations} onChange={e => setObservations(e.target.value)} placeholder="Facultatif" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({
            id: balanceId,
            data: {
              date_verification: dateVerification,
              resultat,
              verificateur: verificateur || undefined,
              ecart_mesure_g: ecartMesureG ? parseFloat(ecartMesureG) : undefined,
              observations: observations || undefined,
              prochaine_verification: prochaineVerification || undefined,
            },
          })}
          className="px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "#1a4731" }}
        >
          {mutation.isPending ? "Enregistrement…" : "Valider"}
        </button>
      </div>
    </div>
  );
}

// ─── Litiges ──────────────────────────────────────────────────────────────────

function LitigesTab({ qc, toast }: { qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const { data: litigesData, isLoading } = useGetLitiges();
  const [resoudreId, setResoudreId] = useState<number | null>(null);
  const [poidsRetenu, setPoidsRetenu] = useState("");
  const [decision, setDecision] = useState("");

  const resoudreMutation = useResoudreLitige({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetLitigesQueryKey() });
        setResoudreId(null);
        setPoidsRetenu("");
        setDecision("");
        toast({ title: "Litige résolu" });
      },
    },
  });

  const litiges = litigesData?.litiges ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">{litiges.length} litige(s)</span>
        <span className="text-xs text-gray-400">Les litiges sont créés automatiquement lors d'un écart de pesée excessif</span>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Chargement…</div>
      ) : litiges.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          <CheckCircle2 size={32} className="mx-auto mb-2 opacity-30" />
          Aucun litige en cours
        </div>
      ) : (
        <div className="space-y-3">
          {litiges.map((l) => (
            <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900">Livraison #{l.livraison_id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LITIGE_STATUT_COLORS[l.statut ?? "ouvert"] ?? ""}`}>
                      {LITIGE_STATUT_LABELS[l.statut ?? "ouvert"] ?? l.statut}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                    <div>Date : {String(l.date_litige)}</div>
                    {l.motif && <div>Motif : {l.motif}</div>}
                    {l.poids_conteste_kg && <div>Poids contesté : {l.poids_conteste_kg} kg</div>}
                    {l.decision && <div className="text-green-700">Décision : {l.decision}</div>}
                  </div>
                </div>
                {(l.statut === "ouvert" || l.statut === "en_cours") && (
                  <button
                    onClick={() => setResoudreId(resoudreId === l.id ? null : l.id)}
                    className="text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Résoudre
                  </button>
                )}
              </div>
              {resoudreId === l.id && (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Poids retenu (kg) *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        required
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        value={poidsRetenu}
                        onChange={e => setPoidsRetenu(e.target.value)}
                        placeholder="120.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Décision *</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        value={decision}
                        onChange={e => setDecision(e.target.value)}
                        placeholder="Ex: Poids moyen retenu"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setResoudreId(null)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
                    <button
                      type="button"
                      disabled={!poidsRetenu || !decision || resoudreMutation.isPending}
                      onClick={() => resoudreMutation.mutate({ id: l.id, data: { poids_final_retenu_kg: parseFloat(poidsRetenu), decision } })}
                      className="px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50"
                      style={{ backgroundColor: "#1a4731" }}
                    >
                      {resoudreMutation.isPending ? "Enregistrement…" : "Confirmer"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stats & Config ───────────────────────────────────────────────────────────

function StatsTab({ qc, toast }: { qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const { data: stats } = useGetStatistiquesPesee();
  const { data: config } = useGetConfigPesee();
  const [showConfig, setShowConfig] = useState(false);
  const [ecartMax, setEcartMax] = useState("");
  const [seuilDouble, setSeuilDouble] = useState("");
  const [toleranceG, setToleranceG] = useState("");
  const [freqVerif, setFreqVerif] = useState("");

  const updateConfigMutation = useUpdateConfigPesee({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetConfigPeseeQueryKey() });
        setShowConfig(false);
        toast({ title: "Configuration mise à jour" });
      },
    },
  });

  const kpis = [
    { label: "Pesées totales", value: stats?.nb_pesees_total ?? 0, icon: Scale },
    { label: "Doubles pesées", value: stats?.nb_double_pesees ?? 0, icon: Scale },
    { label: "Écart moyen", value: `${(stats?.ecart_moyen_pct ?? 0).toFixed(2)} %`, icon: BarChart3 },
    { label: "Litiges ouverts", value: stats?.nb_litiges ?? 0, icon: AlertTriangle },
    { label: "Litiges résolus", value: stats?.nb_litiges_resolus ?? 0, icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className="text-gray-400" />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <div className="text-xl font-bold text-gray-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-2"><Settings size={14} />Configuration pesée</h3>
          <button onClick={() => setShowConfig(!showConfig)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            {showConfig ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showConfig ? "Masquer" : "Modifier"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Écart max autorisé</span>
            <span className="font-medium">{config?.ecart_max_autorise_pct ?? 2} %</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Seuil double pesée</span>
            <span className="font-medium">{config?.seuil_double_pesee_kg ?? 500} kg</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tolérance balance</span>
            <span className="font-medium">{config?.tolerance_balance_g ?? 500} g</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Fréquence vérification</span>
            <span className="font-medium">{config?.frequence_verification_jours ?? 90} j</span>
          </div>
        </div>
        {showConfig && (
          <div className="border-t border-gray-100 mt-4 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Écart max autorisé (%)</label>
                <input type="number" min="0" step="0.1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={ecartMax || String(config?.ecart_max_autorise_pct ?? 2)} onChange={e => setEcartMax(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Seuil double pesée (kg)</label>
                <input type="number" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={seuilDouble || String(config?.seuil_double_pesee_kg ?? 500)} onChange={e => setSeuilDouble(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tolérance balance (g)</label>
                <input type="number" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={toleranceG || String(config?.tolerance_balance_g ?? 500)} onChange={e => setToleranceG(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fréquence vérification (jours)</label>
                <input type="number" min="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" value={freqVerif || String(config?.frequence_verification_jours ?? 90)} onChange={e => setFreqVerif(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfig(false)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
              <button
                disabled={updateConfigMutation.isPending}
                onClick={() => updateConfigMutation.mutate({ data: {
                  ecart_max_autorise_pct: ecartMax ? parseFloat(ecartMax) : undefined,
                  seuil_double_pesee_kg: seuilDouble ? parseFloat(seuilDouble) : undefined,
                  tolerance_balance_g: toleranceG ? parseFloat(toleranceG) : undefined,
                  frequence_verification_jours: freqVerif ? parseInt(freqVerif) : undefined,
                }})}
                className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: "#1a4731" }}
              >
                {updateConfigMutation.isPending ? "Mise à jour…" : "Enregistrer"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

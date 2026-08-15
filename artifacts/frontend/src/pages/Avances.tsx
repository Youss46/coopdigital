import { useState, useRef } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import {
  useGetAvances,
  useGetAvancesEncours,
  useCreateAvance,
  useRembourserAvance,
  useGetMembres,
  useGetScoringResume,
  getGetAvancesQueryKey,
  getGetAvancesEncoursQueryKey,
  getGetScoringResumeQueryKey,
  Avance,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, TrendingDown, Banknote, Clock, FileDown, CloudOff, HandCoins, Loader2, Check, Settings2, History } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { usePermission } from "@/hooks/usePermission";
import { openPdfViewer } from "@/lib/pdfViewer";
import { queueOp } from "@/lib/idb";

function formaterFCFA(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}
function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const BASE = import.meta.env.VITE_API_URL ?? "";

async function downloadPdf(url: string, filename: string) {
  const token = localStorage.getItem("coop_token") ?? "";
  const res = await fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return;
  const blob = await res.blob();
  if (blob.size === 0) return;
  openPdfViewer(URL.createObjectURL(blob), filename);
}

const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  integral: { label: "Intégral",  cls: "bg-gray-100 text-gray-600" },
  partiel:  { label: "Partiel",   cls: "bg-blue-100 text-blue-700" },
  reporte:  { label: "Reporté",   cls: "bg-amber-100 text-amber-700" },
};

export default function Avances() {
  const queryClient = useQueryClient();
  const peutOctroyer = usePermission("avances", "octroyer");
  const peutRembourser = usePermission("avances", "rembourser");
  const [modalOuvert, setModalOuvert] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState<"" | "en_cours" | "rembourse" | "en_retard">("");
  const [modalRemboursement, setModalRemboursement] = useState<{ id: number; solde: number; nom: string } | null>(null);
  const [montantRemboursement, setMontantRemboursement] = useState("");
  const [planTarget, setPlanTarget] = useState<Avance | null>(null);
  const [notifHorsLigne, setNotifHorsLigne] = useState<string | null>(null);

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
  const [membreSearch, setMembreSearch] = useState("");
  const [membreDropdownOuvert, setMembreDropdownOuvert] = useState(false);
  const membreInputRef = useRef<HTMLInputElement>(null);
  const membreDropdownRef = useRef<HTMLDivElement>(null);

  const selectedMembreId = form.membreId ? parseInt(form.membreId) : 0;
  const { data: scoreResume } = useGetScoringResume(selectedMembreId, {
    query: { queryKey: getGetScoringResumeQueryKey(selectedMembreId), enabled: selectedMembreId > 0 },
  });
  const scoreGlobal = scoreResume ? Number((scoreResume as { score_global?: string }).score_global ?? 0) : null;

  const mutation = useCreateAvance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAvancesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAvancesEncoursQueryKey() });
        setModalOuvert(false);
        setForm({ membreId: "", montantOctroyeFcfa: "", dateOctroi: new Date().toISOString().split("T")[0]!, dateEcheance: "", motif: "" });
        setMembreSearch("");
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
    const payload = {
      membreId: parseInt(form.membreId),
      montantOctroyeFcfa: parseInt(form.montantOctroyeFcfa),
      dateOctroi: form.dateOctroi,
      dateEcheance: form.dateEcheance || undefined,
      motif: form.motif || undefined,
    };
    if (!navigator.onLine) {
      void queueOp({ localId: crypto.randomUUID(), type: "avance", data: payload });
      setModalOuvert(false);
      setForm({ membreId: "", montantOctroyeFcfa: "", dateOctroi: new Date().toISOString().split("T")[0]!, dateEcheance: "", motif: "" });
      setMembreSearch("");
      setNotifHorsLigne("Avance enregistrée hors ligne — sera synchronisée dès le retour en ligne");
      setTimeout(() => setNotifHorsLigne(null), 6000);
      return;
    }
    mutation.mutate({ data: payload });
  };

  const ouvrirRemboursement = (id: number, solde: number, nom: string) => {
    setMontantRemboursement(String(solde));
    setModalRemboursement({ id, solde, nom });
  };

  const confirmerRemboursement = () => {
    if (!modalRemboursement) return;
    const montant = parseInt(montantRemboursement.replace(/\D/g, ""));
    if (isNaN(montant) || montant <= 0) return;
    if (!navigator.onLine) {
      void queueOp({
        localId: crypto.randomUUID(),
        type: "remboursement",
        data: { avanceId: modalRemboursement.id, montantFcfa: Math.min(montant, modalRemboursement.solde) },
      });
      setModalRemboursement(null);
      setMontantRemboursement("");
      setNotifHorsLigne("Remboursement enregistré hors ligne — sera synchronisé dès le retour en ligne");
      setTimeout(() => setNotifHorsLigne(null), 6000);
      return;
    }
    mutationRembourser.mutate(
      { id: modalRemboursement.id, data: { montantFcfa: Math.min(montant, modalRemboursement.solde) } },
      { onSuccess: () => { setModalRemboursement(null); setMontantRemboursement(""); } }
    );
  };

  return (
    <div className="space-y-5">
      {notifHorsLigne && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          <CloudOff size={16} className="shrink-0" />
          {notifHorsLigne}
        </div>
      )}
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
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Membre</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Octroyé</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Remboursé</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Solde</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Échéance</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <TableSkeleton colonnes={8} lignes={5} />
            ) : avances.length === 0 ? (
              <EmptyState
                colSpan={8}
                icone={HandCoins}
                titre="Aucune avance"
                description="Les avances octroyées aux membres apparaîtront ici."
              />
            ) : (
              avances.map((a: Avance) => {
                const planKey = a.planType ?? "integral";
                const badge = PLAN_BADGE[planKey] ?? PLAN_BADGE["integral"]!;
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.membreNom} {a.membrePrenoms}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formaterFCFA(a.montantOctroyeFcfa)}</td>
                    <td className="px-4 py-3 text-right text-green-700 hidden sm:table-cell">{formaterFCFA(a.montantRembourseFcfa)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-700">{formaterFCFA(a.soldeRestantFcfa)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {planKey === "partiel" && a.montantPartielFcfa && (
                        <p className="text-xs text-gray-400 mt-0.5">{formaterFCFA(a.montantPartielFcfa)}/livr.</p>
                      )}
                      {planKey === "reporte" && a.reportDate && (
                        <p className="text-xs text-gray-400 mt-0.5">Dès {formaterDate(a.reportDate)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{a.dateEcheance ? formaterDate(a.dateEcheance) : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        a.statut === "rembourse" ? "bg-green-100 text-green-700"
                        : a.statut === "en_retard" ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                      }`}>
                        {a.statut === "en_retard" && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75 motion-reduce:hidden" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                          </span>
                        )}
                        {a.statut === "en_cours" ? "En cours" : a.statut === "rembourse" ? "Remboursé" : "En retard"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {peutRembourser && a.statut !== "rembourse" && a.soldeRestantFcfa > 0 && (
                          <>
                            <button
                              onClick={() => setPlanTarget(a)}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                              title="Configurer le plan de déduction"
                            >
                              <Settings2 size={13} /> Plan
                            </button>
                            <span className="text-gray-200">|</span>
                            <button
                              onClick={() => ouvrirRemboursement(a.id, a.soldeRestantFcfa, `${a.membreNom ?? ""} ${a.membrePrenoms ?? ""}`)}
                              className="text-xs text-green-700 hover:text-green-900 font-medium"
                            >
                              Rembourser
                            </button>
                          </>
                        )}
                        <button
                          title="Télécharger le reçu"
                          onClick={() => void downloadPdf(`/api/rapports/recu/avance/${a.id}`, `recu_avance_${a.id}.pdf`)}
                          className="p-1 text-gray-400 hover:text-green-700 transition-colors"
                        >
                          <FileDown size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal octroyer */}
      {modalOuvert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-in zoom-in-95 fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Octroyer une avance</h3>
              <button onClick={() => { setModalOuvert(false); setMembreSearch(""); setMembreDropdownOuvert(false); }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">Membre *</label>
                <input
                  ref={membreInputRef}
                  type="text"
                  required={!form.membreId}
                  readOnly={!!form.membreId}
                  value={form.membreId
                    ? (() => { const m = membres.find((x) => String(x.id) === form.membreId); return m ? `${m.nom} ${m.prenoms}` : membreSearch; })()
                    : membreSearch}
                  onChange={(e) => {
                    setMembreSearch(e.target.value);
                    setForm({ ...form, membreId: "" });
                    setMembreDropdownOuvert(true);
                  }}
                  onFocus={() => { if (!form.membreId) setMembreDropdownOuvert(true); }}
                  onClick={() => {
                    if (form.membreId) {
                      setForm({ ...form, membreId: "" });
                      setMembreSearch("");
                      setMembreDropdownOuvert(true);
                      setTimeout(() => membreInputRef.current?.focus(), 0);
                    }
                  }}
                  onBlur={() => setTimeout(() => setMembreDropdownOuvert(false), 150)}
                  placeholder="Rechercher un membre par nom…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700 cursor-text"
                  autoComplete="off"
                />
                {form.membreId && (
                  <button
                    type="button"
                    onClick={() => { setForm({ ...form, membreId: "" }); setMembreSearch(""); setTimeout(() => membreInputRef.current?.focus(), 0); }}
                    className="absolute right-3 top-1/2 translate-y-1 text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >×</button>
                )}
                {membreDropdownOuvert && !form.membreId && (
                  <div
                    ref={membreDropdownRef}
                    className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto"
                  >
                    {membres
                      .filter((m) => m.statut === "actif" && (
                        membreSearch === "" ||
                        `${m.nom} ${m.prenoms}`.toLowerCase().includes(membreSearch.toLowerCase()) ||
                        (m.telephone ?? "").includes(membreSearch)
                      ))
                      .map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onMouseDown={() => {
                            setForm({ ...form, membreId: String(m.id) });
                            setMembreSearch("");
                            setMembreDropdownOuvert(false);
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        >
                          <span className="font-medium text-gray-900">{m.nom} {m.prenoms}</span>
                          {m.telephone && <span className="ml-2 text-xs text-gray-400">{m.telephone}</span>}
                        </button>
                      ))}
                    {membres.filter((m) => m.statut === "actif" && (
                      membreSearch === "" ||
                      `${m.nom} ${m.prenoms}`.toLowerCase().includes(membreSearch.toLowerCase()) ||
                      (m.telephone ?? "").includes(membreSearch)
                    )).length === 0 && (
                      <p className="px-3 py-3 text-sm text-gray-400 text-center">Aucun membre trouvé</p>
                    )}
                  </div>
                )}
                <input type="hidden" name="membreId" value={form.membreId} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Montant (FCFA) *</label>
                <MoneyInput
                  required
                  value={form.montantOctroyeFcfa}
                  onChange={(raw) => setForm({ ...form, montantOctroyeFcfa: raw })}
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
              {scoreGlobal !== null && scoreGlobal < 40 && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  <span className="text-base leading-none mt-0.5">⚠️</span>
                  <span>Score faible ({scoreGlobal}/100) — avance à risque élevé de non-remboursement.</span>
                </div>
              )}
              {scoreGlobal !== null && scoreGlobal >= 75 && (
                <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                  <span className="text-base leading-none mt-0.5">✅</span>
                  <span>Bon profil ({scoreGlobal}/100) — producteur fiable.</span>
                </div>
              )}
              {mutation.isError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">Erreur lors de la création</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setModalOuvert(false); setMembreSearch(""); setMembreDropdownOuvert(false); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-90 flex items-center justify-center gap-2 transition-colors duration-200"
                  style={{ backgroundColor: mutation.isError ? "#b91c1c" : "#c4962a" }}
                >
                  {mutation.isPending && <Loader2 size={16} className="animate-spin motion-reduce:animate-none" />}
                  {mutation.isSuccess && !mutation.isPending && <Check size={16} />}
                  {mutation.isPending ? "Enregistrement…" : mutation.isError ? "Réessayer" : "Octroyer l'avance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal remboursement manuel */}
      {modalRemboursement && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm animate-in zoom-in-95 fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Rembourser une avance</h3>
              <button onClick={() => setModalRemboursement(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">
                Membre : <span className="font-semibold text-gray-900">{modalRemboursement.nom}</span>
              </p>
              <p className="text-sm text-gray-500">
                Solde restant : <span className="font-semibold text-amber-700">{formaterFCFA(modalRemboursement.solde)}</span>
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Montant à rembourser (FCFA) *</label>
                <MoneyInput
                  value={montantRemboursement}
                  onChange={(raw) => setMontantRemboursement(raw)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                  autoFocus
                />
              </div>
              {mutationRembourser.isError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">Erreur lors du remboursement</p>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModalRemboursement(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={confirmerRemboursement}
                  disabled={mutationRembourser.isPending || !montantRemboursement}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-90 flex items-center justify-center gap-2 transition-colors duration-200"
                  style={{ backgroundColor: mutationRembourser.isError ? "#b91c1c" : "#1a4731" }}
                >
                  {mutationRembourser.isPending && <Loader2 size={16} className="animate-spin motion-reduce:animate-none" />}
                  {mutationRembourser.isSuccess && !mutationRembourser.isPending && <Check size={16} />}
                  {mutationRembourser.isPending ? "Enregistrement…" : mutationRembourser.isError ? "Réessayer" : "Confirmer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal plan de déduction */}
      {planTarget && (
        <PlanAvanceMembreModal
          avance={planTarget}
          onClose={() => setPlanTarget(null)}
          onSaved={() => {
            setPlanTarget(null);
            queryClient.invalidateQueries({ queryKey: getGetAvancesQueryKey() });
          }}
        />
      )}
    </div>
  );
}

// ─── Modal plan de déduction membre ──────────────────────────────────────────

function PlanAvanceMembreModal({
  avance,
  onClose,
  onSaved,
}: {
  avance: Avance;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [planType, setPlanType] = useState<"integral" | "partiel" | "reporte">(
    (avance.planType as "integral" | "partiel" | "reporte") ?? "integral",
  );
  const [montantPartiel, setMontantPartiel] = useState<string>(
    avance.montantPartielFcfa ? String(avance.montantPartielFcfa) : "",
  );
  const [reportDate, setReportDate] = useState<string>(avance.reportDate ?? "");
  const [erreur, setErreur] = useState<string | null>(null);

  // Historique de déductions
  const { data: historique, isLoading: histLoading } = useQuery({
    queryKey: ["remboursements-avance-membre", avance.id],
    queryFn: async () => {
      const token = localStorage.getItem("coop_token") ?? "";
      const r = await fetch(`${BASE}/api/avances/${avance.id}/remboursements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return [];
      return r.json() as Promise<Array<{ id: number; montantFcfa: number; note: string | null; createdAt: string }>>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("coop_token") ?? "";
      const body: Record<string, unknown> = { plan_type: planType };
      if (planType === "partiel") body["montant_partiel_fcfa"] = Number(montantPartiel) || null;
      if (planType === "reporte") body["report_date"] = reportDate || null;
      const r = await fetch(`${BASE}/api/avances/${avance.id}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json() as { erreur?: string }).erreur ?? "Erreur");
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setErreur((e as Error).message),
  });

  const restant = avance.soldeRestantFcfa;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900">Plan de déduction</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {avance.membreNom} {avance.membrePrenoms} —&nbsp;
              solde&nbsp;: <span className="font-semibold text-amber-700">{formaterFCFA(restant)}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* Sélection du plan */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mode de déduction lors d'un règlement</p>
            <div className="grid grid-cols-3 gap-2">
              {(["integral", "partiel", "reporte"] as const).map((p) => {
                const labels: Record<string, string> = {
                  integral: "Intégral",
                  partiel:  "Partiel",
                  reporte:  "Reporté",
                };
                const descs: Record<string, string> = {
                  integral: "Tout déduit à chaque règlement",
                  partiel:  "Montant fixe par règlement",
                  reporte:  "Aucune déduction jusqu'à la date choisie",
                };
                return (
                  <button
                    key={p}
                    onClick={() => setPlanType(p)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      planType === p ? "border-green-600 bg-green-50" : "border-gray-100 hover:border-gray-300"
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-800">{labels[p]}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{descs[p]}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Champs conditionnels */}
          {planType === "partiel" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Montant à déduire par règlement (FCFA)</label>
              <MoneyInput
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                value={montantPartiel}
                onChange={setMontantPartiel}
                placeholder="Ex : 25 000"
              />
              {Number(montantPartiel) > 0 && (
                <p className="text-xs text-gray-400">
                  Durée estimée : {Math.ceil(restant / Number(montantPartiel))} règlement(s)
                </p>
              )}
            </div>
          )}

          {planType === "reporte" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Reprendre les déductions à partir du</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
              <p className="text-xs text-gray-400">Aucune déduction ne sera effectuée sur les livraisons antérieures à cette date.</p>
            </div>
          )}

          {/* Historique */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-2">
              <History size={13} /> Historique des déductions
            </p>
            {histLoading ? (
              <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
            ) : !historique || historique.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Aucune déduction enregistrée</p>
            ) : (
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
                {historique.map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-gray-500">
                      {new Date(h.createdAt).toLocaleDateString("fr-FR")}
                      {h.note && <span className="ml-1 text-gray-400">· {h.note}</span>}
                    </span>
                    <span className="font-semibold text-green-700">−&nbsp;{h.montantFcfa.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {erreur && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{erreur}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-5 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: "#1a4731" }}
          >
            {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
            Enregistrer le plan
          </button>
        </div>
      </div>
    </div>
  );
}

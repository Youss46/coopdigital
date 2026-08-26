import { useState } from "react";
import {
  useGetExportateurs,
  useCreateExportateur,
  useGetExportateurById,
  useSignalerRefusVente,
  useGetEntrepots,
  type EntrepotStock,
} from "@workspace/api-client-react";
import {
  getGetExportateursQueryKey,
  getGetExportateurByIdQueryKey,
  getGetEntrepotsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, PlusCircle, ChevronRight, ArrowLeft, AlertTriangle, Loader2 } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { NumericInput } from "@/components/ui/numeric-input";

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
  refoule: "bg-orange-100 text-orange-700",
  partiellement_refoule: "bg-orange-50 text-orange-600",
};
const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  partiel: "Partiel",
  regle: "Réglé",
  en_retard: "En retard",
  refoule: "Refoulé",
  partiellement_refoule: "Part. refoulé",
};

const REFUS_INIT = { poidsRefuleKg: "", nombreSacsRefoules: "", dateRefus: new Date().toISOString().split("T")[0]!, motifRefus: "", entrepotRetourId: "" };

export default function ExportateursPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { utilisateur: user } = useAuth();
  const peutCreer = usePermission("exportateurs", "creer");
  const peutSignalerRefus = usePermission("refus", "traiter");
  const [vueFiche, setVueFiche] = useState<number | null>(null);
  const [modalExp, setModalExp] = useState(false);
  const [modalRefus, setModalRefus] = useState<number | null>(null);
  const [formRefus, setFormRefus] = useState(REFUS_INIT);
  const [formExp, setFormExp] = useState({ nom: "", contact: "", ville: "", agrementNumero: "" });

  const { data: exportateurs = [], isLoading } = useGetExportateurs();
  const { data: fiche } = useGetExportateurById(vueFiche ?? 0, {
    query: { enabled: vueFiche !== null, queryKey: getGetExportateurByIdQueryKey(vueFiche ?? 0) },
  });

  const mutExp = useCreateExportateur({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetExportateursQueryKey() });
        setModalExp(false);
        setFormExp({ nom: "", contact: "", ville: "", agrementNumero: "" });
      },
    },
  });

  const mutRefus = useSignalerRefusVente({
    mutation: {
      onSuccess: () => {
        if (vueFiche) queryClient.invalidateQueries({ queryKey: getGetExportateurByIdQueryKey(vueFiche) });
        setModalRefus(null);
        setFormRefus(REFUS_INIT);
        toast({ title: "Refus enregistré", description: "Le lot refoulé a bien été signalé." });
      },
      onError: () => {
        toast({ title: "Erreur", description: "Impossible d'enregistrer le refus.", variant: "destructive" });
      },
    },
  });

  const { data: entrepots = [] } = useGetEntrepots({ query: { queryKey: getGetEntrepotsQueryKey() } });

  // Vue fiche exportateur
  if (vueFiche !== null && fiche) {
    return (
      <>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setVueFiche(null)}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm"
          >
            <ArrowLeft size={15} />
            Retour
          </button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{fiche.exportateur.nom}</h2>
              <p className="text-gray-500 text-sm mt-0.5">{fiche.exportateur.ville ?? ""} {fiche.exportateur.contact ? `• ${fiche.exportateur.contact}` : ""}</p>
              {fiche.exportateur.agrementNumero && (
                <p className="text-xs text-gray-400 mt-0.5">Agrément : {fiche.exportateur.agrementNumero}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{formaterFCFA(fiche.soldeTotalDuFcfa)}</p>
              <p className="text-xs text-gray-400">Solde dû total</p>
            </div>
          </div>

          <h3 className="font-semibold text-gray-900 mb-3">Historique des ventes ({fiche.ventes.length})</h3>
          {fiche.ventes.length === 0 ? (
            <p className="text-gray-400 text-sm">Aucune vente enregistrée</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Poids</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Total</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Solde dû</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Statut</th>
                    {peutSignalerRefus && <th className="px-3 py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {fiche.ventes.map((v) => (
                    <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-600">{formaterDate(v.dateVente)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{parseFloat(v.poidsKg).toFixed(0)} kg</td>
                      <td className="px-3 py-2.5 font-medium">{formaterFCFA(v.montantTotalFcfa)}</td>
                      <td className="px-3 py-2.5 font-semibold text-gray-900">{formaterFCFA(v.soldeDuFcfa)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[v.statut] ?? ""}`}>
                          {STATUT_LABELS[v.statut]}
                        </span>
                      </td>
                      {peutSignalerRefus && (
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => { setModalRefus(v.id); setFormRefus(REFUS_INIT); }}
                            className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium whitespace-nowrap"
                          >
                            <AlertTriangle size={12} />
                            Signaler refus
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal signaler un refus — fiche view */}
      {modalRefus !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-500" />
              <h3 className="font-bold text-gray-900">Signaler un lot refoulé</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Poids refoulé (kg) *</label>
                   <NumericInput
                    step="0.1"
                    value={formRefus.poidsRefuleKg}
                     onChange={(v) => setFormRefus((f) => ({ ...f, poidsRefuleKg: v }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="500"
                   />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de sacs *</label>
                   <NumericInput
                    value={formRefus.nombreSacsRefoules}
                     onChange={(v) => setFormRefus((f) => ({ ...f, nombreSacsRefoules: v }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="10"
                   />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date du refus *</label>
                <input
                  type="date"
                  value={formRefus.dateRefus}
                  onChange={(e) => setFormRefus((f) => ({ ...f, dateRefus: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Entrepôt de retour *</label>
                <select
                  value={formRefus.entrepotRetourId}
                  onChange={(e) => setFormRefus((f) => ({ ...f, entrepotRetourId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="">— Sélectionner —</option>
                  {(entrepots as EntrepotStock[]).map((e) => (
                    <option key={e.id} value={e.id}>{e.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Motif du refus</label>
                <input
                  type="text"
                  value={formRefus.motifRefus}
                  onChange={(e) => setFormRefus((f) => ({ ...f, motifRefus: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="Humidité excessive, qualité insuffisante…"
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => { setModalRefus(null); setFormRefus(REFUS_INIT); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={() => mutRefus.mutate({
                  id: modalRefus!,
                  data: {
                    poidsRefuleKg: parseFloat(formRefus.poidsRefuleKg),
                    nombreSacsRefoules: parseInt(formRefus.nombreSacsRefoules),
                    dateRefus: formRefus.dateRefus,
                    entrepotRetourId: parseInt(formRefus.entrepotRetourId),
                    ...(formRefus.motifRefus ? { motifRefus: formRefus.motifRefus } : {}),
                  },
                })}
                disabled={!formRefus.poidsRefuleKg || !formRefus.nombreSacsRefoules || !formRefus.dateRefus || !formRefus.entrepotRetourId || mutRefus.isPending}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: "#c2410c" }}
              >
                {mutRefus.isPending ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</> : "Confirmer le refus"}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exportateurs</h1>
          <p className="text-gray-500 text-sm mt-1">Gestion des acheteurs et créances</p>
        </div>
        <div className="flex gap-2">
          {peutCreer && (
            <button
              onClick={() => setModalExp(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: "#1a4731" }}
            >
              <PlusCircle size={15} />
              Nouvel exportateur
            </button>
          )}
        </div>
      </div>

      {/* Liste exportateurs */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : exportateurs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Building2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Aucun exportateur enregistré</p>
          {peutCreer && (
            <button
              onClick={() => setModalExp(true)}
              className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: "#1a4731" }}
            >
              Ajouter un exportateur
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Exportateur</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Ville</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Contact</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Créances</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {exportateurs.map((exp) => (
                  <tr key={exp.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{exp.nom}</div>
                      {exp.agrementNumero && (
                        <div className="text-xs text-gray-400">{exp.agrementNumero}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{exp.ville ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{exp.contact ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {(exp.soldeTotalDuFcfa ?? 0) > 0 ? (
                        <span className="font-semibold text-red-600">
                          {formaterFCFA(exp.soldeTotalDuFcfa ?? 0)}
                        </span>
                      ) : (
                        <span className="text-green-600 text-xs font-medium">Soldé</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setVueFiche(exp.id)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"
                      >
                        Voir <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal nouvel exportateur */}
      {modalExp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Nouvel exportateur</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              {[
                { key: "nom", label: "Nom *", placeholder: "SIFCA Export SA" },
                { key: "contact", label: "Contact", placeholder: "+225 27 21…" },
                { key: "ville", label: "Ville", placeholder: "Abidjan" },
                { key: "agrementNumero", label: "N° agrément", placeholder: "AGR-CI-…" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    type="text"
                    value={(formExp as Record<string, string>)[key]}
                    onChange={(e) => setFormExp((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setModalExp(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
              <button
                onClick={() => mutExp.mutate({ data: { cooperativeId: user?.cooperativeId ?? 0, ...formExp } })}
                disabled={!formExp.nom || mutExp.isPending}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "#1a4731" }}
              >
                {mutExp.isPending ? "Enregistrement…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal signaler un refus */}
      {modalRefus !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-500" />
              <h3 className="font-bold text-gray-900">Signaler un lot refoulé</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Poids refoulé (kg) *</label>
                   <NumericInput
                    step="0.1"
                    value={formRefus.poidsRefuleKg}
                     onChange={(v) => setFormRefus((f) => ({ ...f, poidsRefuleKg: v }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="500"
                   />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de sacs *</label>
                   <NumericInput
                    value={formRefus.nombreSacsRefoules}
                     onChange={(v) => setFormRefus((f) => ({ ...f, nombreSacsRefoules: v }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="10"
                   />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date du refus *</label>
                <input
                  type="date"
                  value={formRefus.dateRefus}
                  onChange={(e) => setFormRefus((f) => ({ ...f, dateRefus: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Entrepôt de retour *</label>
                <select
                  value={formRefus.entrepotRetourId}
                  onChange={(e) => setFormRefus((f) => ({ ...f, entrepotRetourId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="">— Sélectionner —</option>
                  {(entrepots as EntrepotStock[]).map((e) => (
                    <option key={e.id} value={e.id}>{e.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Motif du refus</label>
                <input
                  type="text"
                  value={formRefus.motifRefus}
                  onChange={(e) => setFormRefus((f) => ({ ...f, motifRefus: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="Humidité excessive, qualité insuffisante…"
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => { setModalRefus(null); setFormRefus(REFUS_INIT); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={() => mutRefus.mutate({
                  id: modalRefus!,
                  data: {
                    poidsRefuleKg: parseFloat(formRefus.poidsRefuleKg),
                    nombreSacsRefoules: parseInt(formRefus.nombreSacsRefoules),
                    dateRefus: formRefus.dateRefus,
                    entrepotRetourId: parseInt(formRefus.entrepotRetourId),
                    ...(formRefus.motifRefus ? { motifRefus: formRefus.motifRefus } : {}),
                  },
                })}
                disabled={!formRefus.poidsRefuleKg || !formRefus.nombreSacsRefoules || !formRefus.dateRefus || !formRefus.entrepotRetourId || mutRefus.isPending}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: "#c2410c" }}
              >
                {mutRefus.isPending ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</> : "Confirmer le refus"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

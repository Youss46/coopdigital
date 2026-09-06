import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Clock, CreditCard, Loader2, XCircle, Ban, AlertTriangle } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL ?? "";
const token = () => localStorage.getItem("coop_token") ?? "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { headers: headers() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.erreur ?? response.statusText);
  return body as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.erreur ?? response.statusText);
  return result as T;
}

type CarteReglement = {
  id: number;
  paiementId: number;
  membreId: number;
  numeroCarteSnapshot: string;
  beneficiaire: string;
  montantFcfa: number;
  statut: "en_attente" | "paye" | "rejete" | "annule";
  compteBancaireId: number | null;
  nomCompteBancaire: string | null;
  dateCreation: string;
  datePaiement: string | null;
  dateRejet: string | null;
  motifRejet: string | null;
  motifAnnulation: string | null;
};

type CompteBancaire = {
  id: number;
  nom: string;
  banque: string;
  solde_actuel_fcfa: string;
};

const statutLabels: Record<CarteReglement["statut"], { label: string; color: string; icon: typeof Clock }> = {
  en_attente: { label: "En attente", color: "bg-amber-100 text-amber-800", icon: Clock },
  paye: { label: "Payé", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  rejete: { label: "Rejeté", color: "bg-red-100 text-red-800", icon: XCircle },
  annule: { label: "Annulé", color: "bg-gray-100 text-gray-600", icon: Ban },
};

function fmt(value: number) {
  return `${new Intl.NumberFormat("fr-FR").format(value)} FCFA`;
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString("fr-FR") : "—";
}

export default function ReglementsCartesProducteursPage() {
  const peutPayer = usePermission("paiements", "valider");
  const peutRejeter = usePermission("paiements", "rejeter");
  const peutAnnuler = usePermission("paiements", "annuler");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = useState<"tous" | CarteReglement["statut"]>("en_attente");
  const [action, setAction] = useState<{ type: "payer" | "rejeter" | "annuler"; row: CarteReglement } | null>(null);
  const [compteId, setCompteId] = useState("");
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().slice(0, 10));
  const [motif, setMotif] = useState("");

  const reglementsQuery = useQuery({
    queryKey: ["reglements-cartes-producteurs", filtre],
    queryFn: () => apiFetch<CarteReglement[]>(
      filtre === "tous" ? "/api/paiements/cartes-producteur" : `/api/paiements/cartes-producteur?statut=${filtre}`,
    ),
  });
  const comptesQuery = useQuery({
    queryKey: ["banque-comptes"],
    queryFn: () => apiFetch<CompteBancaire[]>("/api/banque"),
    enabled: !!action && action.type === "payer",
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error("Aucune action sélectionnée");
      if (action.type === "payer") {
        return apiPost(`/api/paiements/cartes-producteur/${action.row.id}/payer`, {
          compteBancaireId: Number(compteId),
          datePaiement,
        });
      }
      return apiPost(`/api/paiements/cartes-producteur/${action.row.id}/${action.type === "rejeter" ? "rejeter" : "annuler"}`, {
        ...(action.type === "rejeter" ? { motifRejet: motif } : { motifAnnulation: motif }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reglements-cartes-producteurs"] });
      void queryClient.invalidateQueries({ queryKey: ["banque-comptes"] });
      setAction(null);
      setCompteId("");
      setMotif("");
      toast({ title: "Opération enregistrée", description: "Le règlement carte producteur a été actualisé." });
    },
    onError: (error: Error) => toast({ title: "Opération impossible", description: error.message, variant: "destructive" }),
  });

  const rows = reglementsQuery.data ?? [];
  const totalEnAttente = useMemo(() => rows.filter((row) => row.statut === "en_attente").reduce((sum, row) => sum + row.montantFcfa, 0), [rows]);
  const selectedAccount = comptesQuery.data?.find((account) => account.id === Number(compteId));

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="text-emerald-600" size={24} /> Cartes producteur
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Règlements différés : aucun TPE n’est appelé, le compte bancaire interne est débité lors de la confirmation.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-right">
          <p className="text-xs text-amber-700">À débiter</p>
          <p className="text-lg font-bold text-amber-900">{fmt(totalEnAttente)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["en_attente", "paye", "rejete", "annule", "tous"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setFiltre(value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${filtre === value ? "bg-emerald-700 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            {value === "tous" ? "Tous" : statutLabels[value].label}
          </button>
        ))}
      </div>

      {reglementsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-500"><Loader2 className="animate-spin mr-2" size={18} /> Chargement…</div>
      ) : reglementsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Impossible de charger les règlements carte producteur.</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">Aucun règlement pour ce filtre.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Producteur</th>
                <th className="px-4 py-3">Carte utilisée</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Créé le</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const status = statutLabels[row.statut];
                const Icon = status.icon;
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-gray-900">{row.beneficiaire}</p>
                      <p className="text-xs text-gray-500">Règlement #{row.id} · paiement #{row.paiementId}</p>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-gray-700">{row.numeroCarteSnapshot}</td>
                    <td className="px-4 py-4 font-semibold text-gray-900">{fmt(row.montantFcfa)}</td>
                    <td className="px-4 py-4 text-gray-600">{dateLabel(row.dateCreation)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${status.color}`}><Icon size={12} />{status.label}</span>
                      {row.statut === "paye" && row.nomCompteBancaire && <p className="mt-1 text-xs text-gray-500">{row.nomCompteBancaire} · {dateLabel(row.datePaiement)}</p>}
                      {(row.motifRejet || row.motifAnnulation) && <p className="mt-1 max-w-[220px] text-xs text-gray-500">{row.motifRejet ?? row.motifAnnulation}</p>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {row.statut === "en_attente" && (
                        <div className="flex justify-end gap-2">
                          {peutPayer && <button onClick={() => setAction({ type: "payer", row })} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"><Banknote size={13} className="mr-1 inline" />Marquer payé</button>}
                          {peutRejeter && <button onClick={() => { setMotif(""); setAction({ type: "rejeter", row }); }} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">Rejeter</button>}
                          {peutAnnuler && <button onClick={() => { setMotif(""); setAction({ type: "annuler", row }); }} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">Annuler</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900">
              {action.type === "payer" ? "Marquer le règlement payé" : action.type === "rejeter" ? "Rejeter le règlement" : "Annuler le règlement"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{action.row.beneficiaire} · {fmt(action.row.montantFcfa)}</p>
            {action.type === "payer" ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                  Le compte bancaire de la coopérative sera débité uniquement après confirmation.
                </div>
                <label className="block text-sm font-medium text-gray-700">Compte bancaire
                  <select value={compteId} onChange={(event) => setCompteId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2">
                    <option value="">— Choisir un compte —</option>
                    {(comptesQuery.data ?? []).map((account) => <option key={account.id} value={account.id}>{account.nom} · {account.banque} · solde {fmt(Number(account.solde_actuel_fcfa))}</option>)}
                  </select>
                </label>
                {selectedAccount && Number(selectedAccount.solde_actuel_fcfa) < action.row.montantFcfa && (
                  <p className="flex items-center gap-2 text-xs text-red-600"><AlertTriangle size={14} /> Solde insuffisant sur ce compte.</p>
                )}
                <label className="block text-sm font-medium text-gray-700">Date de paiement
                  <input type="date" value={datePaiement} onChange={(event) => setDatePaiement(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
                </label>
              </div>
            ) : (
              <label className="mt-5 block text-sm font-medium text-gray-700">Motif
                <textarea value={motif} onChange={(event) => setMotif(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" placeholder="Saisissez le motif obligatoire…" />
              </label>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setAction(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Annuler</button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || (action.type === "payer" ? !compteId || !datePaiement : !motif.trim())}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
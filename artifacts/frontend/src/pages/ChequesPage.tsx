import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MoneyInput } from "@/components/ui/money-input";
import {
  CheckSquare, Plus, Loader2, X, CheckCircle2, XCircle, Clock,
  AlertTriangle, Ban, Building2, Calendar, Hash, User,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PERMISSIONS } from "@/config/permissions";

// ── Auth helpers ─────────────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const headers = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: headers() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ erreur: r.statusText }))).erreur ?? r.statusText);
  return r.json() as Promise<T>;
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ erreur: r.statusText }))).erreur ?? r.statusText);
  return r.json() as Promise<T>;
}
async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ erreur: r.statusText }))).erreur ?? r.statusText);
  return r.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Cheque {
  id: number;
  numeroCheque: string | null;
  beneficiaire: string;
  montantFcfa: number;
  statut: "emis" | "encaisse" | "rejete" | "annule";
  dateEmission: string;
  dateEcheance: string | null;
  dateEncaissement: string | null;
  dateRejet: string | null;
  motifRejet: string | null;
  motifAnnulation: string | null;
  compteBancaireId: number | null;
  paiementId: number | null;
  membreId: number | null;
  livraisonId: number | null;
  nomBanque: string | null;
  nomMembre: string | null;
  prenomsMembre: string | null;
  createdAt: string;
}

interface CompteBancaire {
  id: number;
  nom: string;
  banque: string;
  numero_compte?: string | null;
  solde_actuel_fcfa: string;
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
function fmt(n: number) { return new Intl.NumberFormat("fr-FR").format(n) + " FCFA"; }
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const STATUTS = {
  emis:      { label: "Émis",      color: "bg-amber-100 text-amber-800",  icon: Clock },
  encaisse:  { label: "Encaissé",  color: "bg-green-100 text-green-800",  icon: CheckCircle2 },
  rejete:    { label: "Rejeté",    color: "bg-red-100 text-red-800",      icon: XCircle },
  annule:    { label: "Annulé",    color: "bg-gray-100 text-gray-600",    icon: Ban },
};

type StatutFiltreType = "tous" | "emis" | "encaisse" | "rejete" | "annule";

// ── Composant badge statut ────────────────────────────────────────────────────
function StatutBadge({ statut }: { statut: Cheque["statut"] }) {
  const s = STATUTS[statut];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      <Icon size={11} /> {s.label}
    </span>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function ChequesPage() {
  const { utilisateur } = useAuth();
  const role = utilisateur?.role ?? "";
  const perms = PERMISSIONS["cheques"] ?? {};
  const peutCreer     = perms["creer"]?.includes(role);
  const peutModifier  = perms["modifier"]?.includes(role);
  const peutEncaisser = perms["encaisser"]?.includes(role);
  const peutRejeter   = perms["rejeter"]?.includes(role);
  const peutAnnuler   = perms["annuler"]?.includes(role);

  const qc = useQueryClient();
  const [espace, setEspace] = useState<"recus" | "emis">("recus");
  const [filtreStatut, setFiltreStatut] = useState<StatutFiltreType>("tous");
  const [chequeSelectionne, setChequeSelectionne] = useState<Cheque | null>(null);

  // Modales
  const [modalCreer, setModalCreer] = useState(false);
  const [modalEditer, setModalEditer] = useState<Cheque | null>(null);
  const [modalEncaisser, setModalEncaisser] = useState<Cheque | null>(null);
  const [modalRejeter, setModalRejeter] = useState<Cheque | null>(null);
  const [modalAnnuler, setModalAnnuler] = useState<Cheque | null>(null);

  // Données
  const url = filtreStatut === "tous" ? "/api/cheques" : `/api/cheques?statut=${filtreStatut}`;
  const { data: cheques = [], isLoading } = useQuery<Cheque[]>({
    queryKey: ["cheques", filtreStatut],
    queryFn: () => apiFetch<Cheque[]>(url),
  });
  const {
    data: comptes = [],
    isLoading: comptesLoading,
    isError: comptesError,
    refetch: refetchComptes,
  } = useQuery<CompteBancaire[]>({
    queryKey: ["banque-comptes"],
    queryFn: () => apiFetch<CompteBancaire[]>("/api/banque"),
  });

  // Stats calculées
  const chequesEmis     = cheques.filter(c => c.statut === "emis");
  const chequesEncaisse = cheques.filter(c => c.statut === "encaisse");
  const chequesRejetes  = cheques.filter(c => c.statut === "rejete");
  const totalEmis    = chequesEmis.reduce((s, c) => s + c.montantFcfa, 0);
  const totalEncaisse = chequesEncaisse.reduce((s, c) => s + c.montantFcfa, 0);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cheques"] });
    void qc.invalidateQueries({ queryKey: ["banque-comptes"] });
    setChequeSelectionne(null);
  };

  // ── Mutations ──────────────────────────────────────────────────────────────
  const mutCreer = useMutation({
    mutationFn: (d: CreerForm) => apiPost<Cheque>("/api/cheques", d),
    onSuccess: () => { invalidate(); setModalCreer(false); },
  });
  const mutEditer = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Cheque> }) =>
      apiPut<Cheque>(`/api/cheques/${id}`, data),
    onSuccess: () => { invalidate(); setModalEditer(null); },
  });
  const mutEncaisser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { compteBancaireId: number; dateEncaissement?: string } }) =>
      apiPost<Cheque>(`/api/cheques/${id}/encaisser`, data),
    onSuccess: () => { invalidate(); setModalEncaisser(null); },
  });
  const mutRejeter = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { motifRejet: string; dateRejet?: string } }) =>
      apiPost<Cheque>(`/api/cheques/${id}/rejeter`, data),
    onSuccess: () => { invalidate(); setModalRejeter(null); },
  });
  const mutAnnuler = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { motifAnnulation: string } }) =>
      apiPost<Cheque>(`/api/cheques/${id}/annuler`, data),
    onSuccess: () => { invalidate(); setModalAnnuler(null); },
  });

  const FILTRES: { key: StatutFiltreType; label: string; count?: number }[] = [
    { key: "tous",      label: "Tous",      count: cheques.length },
    { key: "emis",      label: "Émis",      count: chequesEmis.length },
    { key: "encaisse",  label: "Encaissés", count: chequesEncaisse.length },
    { key: "rejete",    label: "Rejetés",   count: chequesRejetes.length },
    { key: "annule",    label: "Annulés",   count: cheques.filter(c => c.statut === "annule").length },
  ];

  if (espace === "recus") {
    return <ChequesRecusView onBackToEmis={() => setEspace("emis")} peutCreer={peutCreer} />;
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <EspaceTabs active="emis" onChange={setEspace} />
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="text-emerald-600" size={24} />
            Chèques émis
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Suivi des chèques émis — débit bancaire différé à l'encaissement réel
          </p>
        </div>
        {peutCreer && (
          <button
            onClick={() => setModalCreer(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            <Plus size={16} /> Nouveau chèque
          </button>
        )}
      </div>

      {/* Cartes KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Chèques en cours" value={chequesEmis.length} unit="chèque(s)" color="amber" icon={Clock} />
        <KpiCard label="Montant en cours" value={totalEmis} unit="FCFA" color="amber" isMontant />
        <KpiCard label="Encaissés" value={chequesEncaisse.length} unit="chèque(s)" color="green" icon={CheckCircle2} />
        <KpiCard label="Montant encaissé" value={totalEncaisse} unit="FCFA" color="green" isMontant />
      </div>

      {/* Alerte chèques en cours */}
      {chequesEmis.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <strong>{chequesEmis.length} chèque(s) émis</strong> non encore encaissés représentent{" "}
            <strong>{fmt(totalEmis)}</strong> à débiter de la banque lors de l'encaissement réel.
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {FILTRES.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltreStatut(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filtreStatut === f.key
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
            {f.count !== undefined && (
              <span className={`ml-1.5 text-xs ${filtreStatut === f.key ? "opacity-80" : "opacity-60"}`}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>
      ) : cheques.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucun chèque trouvé</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">N° Chèque</th>
                  <th className="px-4 py-3 text-left">Bénéficiaire</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  <th className="px-4 py-3 text-left">Banque</th>
                  <th className="px-4 py-3 text-center">Émis le</th>
                  <th className="px-4 py-3 text-center">Statut</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cheques.map(c => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setChequeSelectionne(chequeSelectionne?.id === c.id ? null : c)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {c.numeroCheque ? (
                        <span className="flex items-center gap-1"><Hash size={11} /> {c.numeroCheque}</span>
                      ) : (
                        <span className="text-gray-400 italic">À renseigner</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.beneficiaire}</div>
                      {c.livraisonId && (
                        <div className="text-xs text-gray-400">Livraison #{c.livraisonId}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {new Intl.NumberFormat("fr-FR").format(c.montantFcfa)}
                      <span className="text-xs font-normal text-gray-400 ml-1">FCFA</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.nomBanque ?? <span className="text-gray-400 italic">Non assigné</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{fmtDate(c.dateEmission)}</td>
                    <td className="px-4 py-3 text-center"><StatutBadge statut={c.statut} /></td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      {c.statut === "emis" && (
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {peutModifier && (
                            <button
                              onClick={() => setModalEditer(c)}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                            >
                              Éditer
                            </button>
                          )}
                          {peutEncaisser && (
                            <button
                              onClick={() => setModalEncaisser(c)}
                              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                            >
                              Encaisser
                            </button>
                          )}
                          {peutRejeter && (
                            <button
                              onClick={() => setModalRejeter(c)}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                            >
                              Rejeter
                            </button>
                          )}
                          {peutAnnuler && (
                            <button
                              onClick={() => setModalAnnuler(c)}
                              className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                            >
                              Annuler
                            </button>
                          )}
                        </div>
                      )}
                      {c.statut === "encaisse" && (
                        <span className="text-xs text-green-600">{fmtDate(c.dateEncaissement)}</span>
                      )}
                      {c.statut === "rejete" && (
                        <span className="text-xs text-red-600">{fmtDate(c.dateRejet)}</span>
                      )}
                      {c.statut === "annule" && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Détail chèque sélectionné */}
      {chequeSelectionne && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Détail du chèque</h3>
            <button onClick={() => setChequeSelectionne(null)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <Detail label="Statut" value={<StatutBadge statut={chequeSelectionne.statut} />} />
            <Detail label="Bénéficiaire" value={chequeSelectionne.beneficiaire} />
            <Detail label="Montant" value={fmt(chequeSelectionne.montantFcfa)} />
            <Detail label="N° Chèque" value={chequeSelectionne.numeroCheque ?? "—"} />
            <Detail label="Banque" value={chequeSelectionne.nomBanque ?? "Non assignée"} />
            <Detail label="Date émission" value={fmtDate(chequeSelectionne.dateEmission)} />
            <Detail label="Date échéance" value={fmtDate(chequeSelectionne.dateEcheance)} />
            {chequeSelectionne.dateEncaissement && (
              <Detail label="Date encaissement" value={fmtDate(chequeSelectionne.dateEncaissement)} />
            )}
            {chequeSelectionne.dateRejet && (
              <Detail label="Date rejet" value={fmtDate(chequeSelectionne.dateRejet)} />
            )}
            {chequeSelectionne.motifRejet && (
              <Detail label="Motif rejet" value={chequeSelectionne.motifRejet} />
            )}
            {chequeSelectionne.motifAnnulation && (
              <Detail label="Motif annulation" value={chequeSelectionne.motifAnnulation} />
            )}
            {chequeSelectionne.livraisonId && (
              <Detail label="Livraison" value={`#${chequeSelectionne.livraisonId}`} />
            )}
          </div>
        </div>
      )}

      {/* ── Modales ── */}
      {modalCreer && (
        <ModalCreer
          onClose={() => setModalCreer(false)}
          onSubmit={d => mutCreer.mutate(d)}
          isPending={mutCreer.isPending}
          error={mutCreer.error?.message}
        />
      )}
      {modalEditer && (
        <ModalEditer
          cheque={modalEditer}
          comptes={comptes}
          onClose={() => setModalEditer(null)}
          onSubmit={d => mutEditer.mutate({ id: modalEditer.id, data: d })}
          isPending={mutEditer.isPending}
          error={mutEditer.error?.message}
        />
      )}
      {modalEncaisser && (
        <ModalEncaisser
          cheque={modalEncaisser}
          comptes={comptes}
           comptesLoading={comptesLoading}
           comptesError={comptesError}
           onRetryComptes={() => { void refetchComptes(); }}
          onClose={() => setModalEncaisser(null)}
          onSubmit={d => mutEncaisser.mutate({ id: modalEncaisser.id, data: d })}
          isPending={mutEncaisser.isPending}
          error={mutEncaisser.error?.message}
        />
      )}
      {modalRejeter && (
        <ModalRejeter
          cheque={modalRejeter}
          onClose={() => setModalRejeter(null)}
          onSubmit={d => mutRejeter.mutate({ id: modalRejeter.id, data: d })}
          isPending={mutRejeter.isPending}
          error={mutRejeter.error?.message}
        />
      )}
      {modalAnnuler && (
        <ModalAnnuler
          cheque={modalAnnuler}
          onClose={() => setModalAnnuler(null)}
          onSubmit={d => mutAnnuler.mutate({ id: modalAnnuler.id, data: d })}
          isPending={mutAnnuler.isPending}
          error={mutAnnuler.error?.message}
        />
      )}
    </div>
  );
}

function EspaceTabs({
  active,
  onChange,
}: {
  active: "recus" | "emis";
  onChange: (value: "recus" | "emis") => void;
}) {
  return (
    <div className="flex rounded-xl border border-gray-200 bg-white p-1 w-fit shadow-sm">
      <button
        onClick={() => onChange("recus")}
        className={`px-4 py-2 rounded-lg text-sm font-medium ${active === "recus" ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
      >
        Chèques reçus
      </button>
      <button
        onClick={() => onChange("emis")}
        className={`px-4 py-2 rounded-lg text-sm font-medium ${active === "emis" ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
      >
        Chèques émis
      </button>
    </div>
  );
}

type ChequeRecu = {
  id: number;
  numeroCheque: string;
  banque: string;
  montantFcfa: number;
  dateReception: string;
  dateEcheance: string | null;
  statut: "a_deposer" | "depose" | "encaisse" | "rejete" | "annule";
  dateDepot: string | null;
  dateEncaissement: string | null;
  dateRejet: string | null;
  motifRejet: string | null;
  dateAnnulation: string | null;
  motifAnnulation: string | null;
  compteBancaireId: number | null;
  venteExportateurId: number;
  exportateurId: number;
  paiementId: number;
  paiementLigneId: number;
  exportateurNom: string | null;
};

type VenteExportateurOption = {
  id: number;
  exportateurId: number;
  exportateurNom: string | null;
  montantTotalFcfa: number;
  montantRecuFcfa: number;
  soldeDuFcfa: number;
  dateVente: string;
  statut: string;
};

type ExportateurOption = {
  id: number;
  nom: string;
};

type CreerChequeRecuPayload = {
  venteExportateurId: number;
  numeroCheque: string;
  banque: string;
  montantFcfa: number;
  dateReception: string;
  dateEcheance: string | null;
};

const STATUTS_RECUS = {
  a_deposer: { label: "À déposer", color: "bg-amber-100 text-amber-800", icon: Clock },
  depose: { label: "Déposé", color: "bg-blue-100 text-blue-800", icon: Building2 },
  encaisse: { label: "Encaissé", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  rejete: { label: "Rejeté", color: "bg-red-100 text-red-800", icon: XCircle },
  annule: { label: "Annulé", color: "bg-gray-100 text-gray-600", icon: Ban },
} as const;

function ChequesRecusView({
  onBackToEmis,
  peutCreer,
}: {
  onBackToEmis: () => void;
  peutCreer: boolean;
}) {
  const qc = useQueryClient();
  const { utilisateur } = useAuth();
  const perms = PERMISSIONS["cheques"] ?? {};
  const role = utilisateur?.role ?? "";
  const peutEncaisser = perms["encaisser"]?.includes(role);
  const peutRejeter = perms["rejeter"]?.includes(role);
  const peutModifier = perms["modifier"]?.includes(role);
  const peutAnnuler = perms["annuler"]?.includes(role);
  const [filtre, setFiltre] = useState<"tous" | ChequeRecu["statut"]>("tous");
  const [action, setAction] = useState<{ type: "deposer" | "encaisser" | "rejeter" | "annuler"; cheque: ChequeRecu } | null>(null);
  const [dateAction, setDateAction] = useState(new Date().toISOString().slice(0, 10));
  const [compteId, setCompteId] = useState("");
  const [motif, setMotif] = useState("");
  const [modalCreer, setModalCreer] = useState(false);

  const url = filtre === "tous" ? "/api/cheques-recus" : `/api/cheques-recus?statut=${filtre}`;
  const { data: cheques = [], isLoading, isError } = useQuery<ChequeRecu[]>({
    queryKey: ["cheques-recus", filtre],
    queryFn: () => apiFetch<ChequeRecu[]>(url),
  });
  const { data: comptes = [] } = useQuery<CompteBancaire[]>({
    queryKey: ["banque-comptes"],
    queryFn: () => apiFetch<CompteBancaire[]>("/api/banque"),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["cheques-recus"] });
    void qc.invalidateQueries({ queryKey: ["banque-comptes"] });
    setAction(null);
    setMotif("");
    setCompteId("");
  };
  const mutAction = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error("Action invalide");
      if (action.type === "deposer") {
        return apiPost<ChequeRecu>(`/api/cheques-recus/${action.cheque.id}/deposer`, { dateDepot: dateAction });
      }
      if (action.type === "encaisser") {
        return apiPost<ChequeRecu>(`/api/cheques-recus/${action.cheque.id}/encaisser`, { compteBancaireId: Number(compteId), dateEncaissement: dateAction });
      }
      if (!motif.trim()) throw new Error(action.type === "rejeter" ? "Le motif de rejet est obligatoire" : "Le motif d'annulation est obligatoire");
      return apiPost<ChequeRecu>(`/api/cheques-recus/${action.cheque.id}/${action.type}`, action.type === "rejeter" ? { motifRejet: motif, dateRejet: dateAction } : { motifAnnulation: motif });
    },
    onSuccess: refresh,
  });
  const mutCreer = useMutation({
    mutationFn: (data: CreerChequeRecuPayload) =>
      apiPost<ChequeRecu>("/api/cheques-recus", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cheques-recus"] });
      void qc.invalidateQueries({ queryKey: ["ventes-exportateurs"] });
      void qc.invalidateQueries({ queryKey: ["exportateurs"] });
      setModalCreer(false);
    },
  });

  const totals = {
    a_deposer: cheques.filter(c => c.statut === "a_deposer"),
    depose: cheques.filter(c => c.statut === "depose"),
    encaisse: cheques.filter(c => c.statut === "encaisse"),
  };
  const filtres: Array<{ key: "tous" | ChequeRecu["statut"]; label: string }> = [
    { key: "tous", label: "Tous" }, { key: "a_deposer", label: "À déposer" },
    { key: "depose", label: "Déposés" }, { key: "encaisse", label: "Encaissés" },
    { key: "rejete", label: "Rejetés" }, { key: "annule", label: "Annulés" },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <EspaceTabs active="recus" onChange={value => value === "emis" && onBackToEmis()} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><CheckSquare className="text-emerald-600" size={24} />Chèques reçus</h1>
          <p className="text-sm text-gray-500 mt-1">Suivi des chèques remis par les exportateurs, de la réception à l'encaissement bancaire.</p>
        </div>
        {peutCreer && (
          <button
            onClick={() => setModalCreer(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 shrink-0"
          >
            <Plus size={16} /> Nouveau chèque reçu
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="À déposer" value={totals.a_deposer.length} unit="chèque(s)" color="amber" icon={Clock} />
        <KpiCard label="Montant à déposer" value={totals.a_deposer.reduce((s, c) => s + c.montantFcfa, 0)} unit="FCFA" color="amber" isMontant />
        <KpiCard label="Déposés" value={totals.depose.length} unit="chèque(s)" color="green" icon={Building2} />
        <KpiCard label="Encaissés" value={totals.encaisse.reduce((s, c) => s + c.montantFcfa, 0)} unit="FCFA" color="green" isMontant />
      </div>
      <div className="flex gap-2 flex-wrap">
        {filtres.map(f => (
          <button key={f.key} onClick={() => setFiltre(f.key)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${filtre === f.key ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{f.label}</button>
        ))}
      </div>
      {isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Impossible de charger les chèques reçus.</div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>
      ) : cheques.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><CheckSquare size={40} className="mx-auto mb-3 opacity-30" /><p className="font-medium">Aucun chèque reçu trouvé</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left">N° Chèque</th><th className="px-4 py-3 text-left">Exportateur</th>
              <th className="px-4 py-3 text-right">Montant</th><th className="px-4 py-3 text-left">Banque</th>
              <th className="px-4 py-3 text-center">Reçu le</th><th className="px-4 py-3 text-center">Statut</th><th className="px-4 py-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">{cheques.map(c => {
              const info = STATUTS_RECUS[c.statut]; const Icon = info.icon;
              return <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs"><span className="flex items-center gap-1"><Hash size={11} />{c.numeroCheque}</span></td>
                <td className="px-4 py-3"><div className="font-medium">{c.exportateurNom ?? "—"}</div><div className="text-xs text-gray-400">Vente #{c.venteExportateurId} · Paiement #{c.paiementId}</div></td>
                <td className="px-4 py-3 text-right font-semibold">{fmt(c.montantFcfa)}</td>
                <td className="px-4 py-3 text-gray-600">{c.banque}</td><td className="px-4 py-3 text-center text-gray-600">{fmtDate(c.dateReception)}</td>
                <td className="px-4 py-3 text-center"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}><Icon size={11} />{info.label}</span></td>
                <td className="px-4 py-3"><div className="flex justify-center gap-1 flex-wrap">
                  {c.statut === "a_deposer" && peutModifier && <button onClick={() => { setAction({ type: "deposer", cheque: c }); setDateAction(new Date().toISOString().slice(0, 10)); }} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">Déposer</button>}
                  {c.statut === "depose" && peutEncaisser && <button onClick={() => { setAction({ type: "encaisser", cheque: c }); setDateAction(new Date().toISOString().slice(0, 10)); }} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Encaisser</button>}
                  {(c.statut === "a_deposer" || c.statut === "depose") && peutRejeter && <button onClick={() => { setAction({ type: "rejeter", cheque: c }); setMotif(""); }} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">Rejeter</button>}
                  {(c.statut === "a_deposer" || c.statut === "depose") && peutAnnuler && <button onClick={() => { setAction({ type: "annuler", cheque: c }); setMotif(""); }} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">Annuler</button>}
                </div></td>
              </tr>;
            })}</tbody>
          </table></div>
        </div>
      )}
      {modalCreer && (
        <ModalCreerRecu
          onClose={() => setModalCreer(false)}
          onSubmit={data => mutCreer.mutate(data)}
          isPending={mutCreer.isPending}
          error={mutCreer.error?.message}
        />
      )}
      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b"><h2 className="font-semibold">{
              action.type === "deposer" ? "Enregistrer le dépôt" : action.type === "encaisser" ? "Encaisser à la banque" : action.type === "rejeter" ? "Rejeter le chèque" : "Annuler le chèque"
            }</h2><button onClick={() => setAction(null)}><X size={18} className="text-gray-400" /></button></div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">Chèque n° <strong>{action.cheque.numeroCheque}</strong> · {fmt(action.cheque.montantFcfa)}</p>
              {action.type !== "annuler" && <div><label className="block text-xs font-medium mb-1">Date</label><input type="date" value={dateAction} onChange={e => setDateAction(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>}
              {action.type === "encaisser" && <div><label className="block text-xs font-medium mb-1">Compte bancaire crédité *</label><select value={compteId} onChange={e => setCompteId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">— Sélectionner —</option>{comptes.map(c => <option key={c.id} value={String(c.id)}>{c.nom} · {c.banque}</option>)}</select></div>}
              {(action.type === "rejeter" || action.type === "annuler") && <div><label className="block text-xs font-medium mb-1">Motif *</label><textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>}
            </div>
            <div className="px-5 pb-5 flex gap-3"><button onClick={() => setAction(null)} className="flex-1 py-2.5 border rounded-lg text-sm">Annuler</button><button onClick={() => mutAction.mutate()} disabled={mutAction.isPending || (action.type === "encaisser" && !compteId) || ((action.type === "rejeter" || action.type === "annuler") && !motif.trim())} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-50">{mutAction.isPending ? "Enregistrement…" : "Confirmer"}</button></div>
            {mutAction.error && <p className="px-5 pb-4 text-xs text-red-600">{mutAction.error.message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composants helpers ─────────────────────────────────────────────────────────

function KpiCard({
  label, value, unit, color, icon: Icon, isMontant,
}: {
  label: string; value: number; unit: string; color: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  isMontant?: boolean;
}) {
  const colors: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700",
    green: "bg-green-50 text-green-700",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className={colors[color]?.split(" ")[1] ?? "text-gray-500"} />}
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <div className="font-bold text-lg text-gray-900">
        {isMontant ? new Intl.NumberFormat("fr-FR").format(value) : value}
        <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-gray-400 mb-0.5">{label}</div>
      <div className="font-medium text-gray-800">{value}</div>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-700" /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

// ── Créer chèque reçu ─────────────────────────────────────────────────────────

function ModalCreerRecu({
  onClose,
  onSubmit,
  isPending,
  error,
}: {
  onClose: () => void;
  onSubmit: (data: CreerChequeRecuPayload) => void;
  isPending: boolean;
  error?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [exportateurId, setExportateurId] = useState("");
  const [venteExportateurId, setVenteExportateurId] = useState("");
  const [numeroCheque, setNumeroCheque] = useState("");
  const [banque, setBanque] = useState("");
  const [montantFcfa, setMontantFcfa] = useState(0);
  const [dateReception, setDateReception] = useState(today);
  const [dateEcheance, setDateEcheance] = useState("");

  const { data: exportateurs = [], isLoading: exportateursLoading, isError: exportateursError } =
    useQuery<ExportateurOption[]>({
      queryKey: ["exportateurs"],
      queryFn: () => apiFetch<ExportateurOption[]>("/api/exportateurs"),
    });
  const { data: ventes = [], isLoading: ventesLoading, isError: ventesError } =
    useQuery<VenteExportateurOption[]>({
      queryKey: ["ventes-exportateurs"],
      queryFn: () => apiFetch<VenteExportateurOption[]>("/api/ventes"),
    });

  const ventesDisponibles = ventes.filter(v =>
    String(v.exportateurId) === exportateurId &&
    Number(v.soldeDuFcfa) > 0 &&
    v.statut !== "refoule",
  );
  const venteSelectionnee = ventes.find(v => String(v.id) === venteExportateurId);
  const chargement = exportateursLoading || ventesLoading;
  const erreurChargement = exportateursError || ventesError;

  const submit = () => {
    if (!venteSelectionnee || !numeroCheque.trim() || !banque.trim() || montantFcfa <= 0) return;
    onSubmit({
      venteExportateurId: venteSelectionnee.id,
      numeroCheque: numeroCheque.trim(),
      banque: banque.trim(),
      montantFcfa,
      dateReception,
      dateEcheance: dateEcheance || null,
    });
  };

  return (
    <ModalShell title="Nouveau chèque reçu" onClose={onClose}>
      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800">
        Le chèque sera enregistré comme règlement de la vente sélectionnée. Il restera « À déposer » jusqu'à son dépôt puis son encaissement bancaire.
      </div>
      {erreurChargement && (
        <p className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
          Impossible de charger les exportateurs ou les ventes ouvertes.
        </p>
      )}
      <div className="space-y-3">
        <Field label="Exportateur *">
          <select
            value={exportateurId}
            disabled={chargement || !!erreurChargement}
            onChange={e => {
              setExportateurId(e.target.value);
              setVenteExportateurId("");
              setMontantFcfa(0);
            }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50"
          >
            <option value="">— Sélectionner un exportateur —</option>
            {exportateurs.map(exportateur => (
              <option key={exportateur.id} value={String(exportateur.id)}>{exportateur.nom}</option>
            ))}
          </select>
        </Field>
        <Field label="Vente à régler *">
          <select
            value={venteExportateurId}
            disabled={!exportateurId || chargement}
            onChange={e => {
              const id = e.target.value;
              const vente = ventesDisponibles.find(v => String(v.id) === id);
              setVenteExportateurId(id);
              setMontantFcfa(vente ? Number(vente.soldeDuFcfa) : 0);
            }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50"
          >
            <option value="">— Sélectionner une vente ouverte —</option>
            {ventesDisponibles.map(vente => (
              <option key={vente.id} value={String(vente.id)}>
                Vente #{vente.id} · solde {fmt(Number(vente.soldeDuFcfa))}
              </option>
            ))}
          </select>
          {exportateurId && !chargement && ventesDisponibles.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">Cet exportateur n'a aucune vente avec un solde disponible.</p>
          )}
        </Field>
        {venteSelectionnee && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <div><span className="block text-gray-400">Montant de la vente</span><strong>{fmt(Number(venteSelectionnee.montantTotalFcfa))}</strong></div>
            <div><span className="block text-gray-400">Solde disponible</span><strong className="text-amber-700">{fmt(Number(venteSelectionnee.soldeDuFcfa))}</strong></div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="N° du chèque *">
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={numeroCheque}
                onChange={e => setNumeroCheque(e.target.value)}
                placeholder="Numéro unique"
                className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </Field>
          <Field label="Banque émettrice *">
            <input
              value={banque}
              onChange={e => setBanque(e.target.value)}
              placeholder="Nom de la banque"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </Field>
        </div>
        <Field label="Montant du chèque *">
          <div className="relative">
            <MoneyInput
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-14"
              placeholder="0"
              value={montantFcfa || ""}
              onChange={value => setMontantFcfa(parseInt(value, 10) || 0)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">FCFA</span>
          </div>
          {venteSelectionnee && montantFcfa > Number(venteSelectionnee.soldeDuFcfa) && (
            <p className="mt-1 text-xs text-red-600">Le montant ne peut pas dépasser le solde disponible de la vente.</p>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de réception *">
            <input
              type="date"
              value={dateReception}
              onChange={e => setDateReception(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
            />
          </Field>
          <Field label="Date d'échéance">
            <input
              type="date"
              value={dateEcheance}
              onChange={e => setDateEcheance(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
            />
          </Field>
        </div>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
          Annuler
        </button>
        <button
          onClick={submit}
          disabled={
            isPending ||
            chargement ||
            !venteSelectionnee ||
            !numeroCheque.trim() ||
            !banque.trim() ||
            montantFcfa <= 0 ||
            montantFcfa > Number(venteSelectionnee?.soldeDuFcfa ?? 0) ||
            !dateReception
          }
          className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />} Enregistrer le chèque
        </button>
      </div>
    </ModalShell>
  );
}

// ── Créer chèque (standalone) ─────────────────────────────────────────────────

interface CreerForm {
  beneficiaire: string;
  montantFcfa: number;
  numeroCheque?: string;
  compteBancaireId?: number;
  dateEmission?: string;
  dateEcheance?: string;
}

function ModalCreer({
  onClose, onSubmit, isPending, error,
}: { onClose: () => void; onSubmit: (d: CreerForm) => void; isPending: boolean; error?: string }) {
  const { data: comptes = [] } = useQuery<{ id: number; nom: string; banque: string }[]>({
    queryKey: ["banque-comptes"],
    queryFn: () => apiFetch<{ id: number; nom: string; banque: string }[]>("/api/banque"),
  });
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<CreerForm>({ beneficiaire: "", montantFcfa: 0, dateEmission: today });
  const set = (k: keyof CreerForm, v: string | number | undefined) => setForm(f => ({ ...f, [k]: v }));

  return (
    <ModalShell title="Nouveau chèque" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Bénéficiaire *">
          <div className="relative">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Nom du bénéficiaire"
              value={form.beneficiaire}
              onChange={e => set("beneficiaire", e.target.value)}
            />
          </div>
        </Field>
        <Field label="Montant *">
          <div className="relative">
            <MoneyInput
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-14"
              placeholder="0"
              value={form.montantFcfa || ""}
              onChange={v => set("montantFcfa", parseInt(v) || 0)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">FCFA</span>
          </div>
        </Field>
        <Field label="N° Chèque">
          <div className="relative">
            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Optionnel"
              value={form.numeroCheque ?? ""}
              onChange={e => set("numeroCheque", e.target.value || undefined)}
            />
          </div>
        </Field>
        <Field label="Compte bancaire à débiter">
          <div className="relative">
            <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
              value={form.compteBancaireId ?? ""}
              onChange={e => set("compteBancaireId", e.target.value ? parseInt(e.target.value) : undefined)}
            >
              <option value="">— À définir lors de l'encaissement —</option>
              {comptes.map(c => <option key={c.id} value={c.id}>{c.nom} ({c.banque})</option>)}
            </select>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date d'émission">
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              value={form.dateEmission ?? today}
              onChange={e => set("dateEmission", e.target.value)}
            />
          </Field>
          <Field label="Date d'échéance">
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              value={form.dateEcheance ?? ""}
              onChange={e => set("dateEcheance", e.target.value || undefined)}
            />
          </Field>
        </div>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
          Annuler
        </button>
        <button
          onClick={() => onSubmit(form)}
          disabled={isPending || !form.beneficiaire || !form.montantFcfa}
          className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />} Créer le chèque
        </button>
      </div>
    </ModalShell>
  );
}

// ── Éditer chèque ─────────────────────────────────────────────────────────────

function ModalEditer({
  cheque, comptes, onClose, onSubmit, isPending, error,
}: {
  cheque: Cheque; comptes: { id: number; nom: string; banque: string }[];
  onClose: () => void; onSubmit: (d: { numeroCheque?: string | null; compteBancaireId?: number | null; dateEcheance?: string | null }) => void;
  isPending: boolean; error?: string;
}) {
  const [numeroCheque, setNumeroCheque] = useState(cheque.numeroCheque ?? "");
  const [compteBancaireId, setCompteBancaireId] = useState<number | null>(cheque.compteBancaireId);
  const [dateEcheance, setDateEcheance] = useState(cheque.dateEcheance ?? "");

  return (
    <ModalShell title="Modifier le chèque" onClose={onClose}>
      <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
        <span className="font-medium text-gray-800">{cheque.beneficiaire}</span>
        {" — "}
        {new Intl.NumberFormat("fr-FR").format(cheque.montantFcfa)} FCFA
      </div>
      <div className="space-y-3">
        <Field label="N° Chèque">
          <div className="relative">
            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={numeroCheque}
              onChange={e => setNumeroCheque(e.target.value)}
              placeholder="N° du chèque bancaire"
            />
          </div>
        </Field>
        <Field label="Compte bancaire à débiter">
          <div className="relative">
            <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
              value={compteBancaireId ?? ""}
              onChange={e => setCompteBancaireId(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">— À définir lors de l'encaissement —</option>
              {comptes.map(c => <option key={c.id} value={c.id}>{c.nom} ({c.banque})</option>)}
            </select>
          </div>
        </Field>
        <Field label="Date d'échéance">
          <input
            type="date"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
            value={dateEcheance}
            onChange={e => setDateEcheance(e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
          Annuler
        </button>
        <button
          onClick={() => onSubmit({
            numeroCheque: numeroCheque || null,
            compteBancaireId,
            dateEcheance: dateEcheance || null,
          })}
          disabled={isPending}
          className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />} Enregistrer
        </button>
      </div>
    </ModalShell>
  );
}

// ── Encaisser chèque ──────────────────────────────────────────────────────────

function ModalEncaisser({
  cheque, comptes, comptesLoading, comptesError, onRetryComptes,
  onClose, onSubmit, isPending, error,
}: {
  cheque: Cheque;
  comptes: CompteBancaire[];
  comptesLoading: boolean;
  comptesError: boolean;
  onRetryComptes: () => void;
  onClose: () => void;
  onSubmit: (d: { compteBancaireId: number; dateEncaissement?: string }) => void;
  isPending: boolean; error?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [compteBancaireId, setCompteBancaireId] = useState<number | "">(
    cheque.compteBancaireId ?? "",
  );
  const [dateEncaissement, setDateEncaissement] = useState(today);

  useEffect(() => {
    if (comptesLoading) return;
    setCompteBancaireId(current => {
      if (current !== "" && comptes.some(c => c.id === current)) return current;
      if (cheque.compteBancaireId && comptes.some(c => c.id === cheque.compteBancaireId)) {
        return cheque.compteBancaireId;
      }
      return comptes.length === 1 ? comptes[0].id : "";
    });
  }, [comptes, comptesLoading, cheque.compteBancaireId]);

  const compteSelectionne = comptes.find(c => c.id === compteBancaireId);
  const peutConfirmer = !comptesLoading && !comptesError && !!compteSelectionne;

  return (
    <ModalShell title="Confirmer l'encaissement" onClose={onClose}>
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-1">
        <p className="font-semibold text-green-800">
          Ce chèque sera débité de votre compte bancaire.
        </p>
        <p className="text-green-700">
          Bénéficiaire : <strong>{cheque.beneficiaire}</strong>
          {cheque.numeroCheque && <> — n°{cheque.numeroCheque}</>}
        </p>
        <p className="text-green-700">
          Montant : <strong>{new Intl.NumberFormat("fr-FR").format(cheque.montantFcfa)} FCFA</strong>
        </p>
      </div>
      <div className="space-y-3">
        <Field label="Compte bancaire à débiter *">
          <div className="relative">
            <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
              value={compteBancaireId}
              disabled={comptesLoading || comptesError || comptes.length === 0}
              onChange={e => setCompteBancaireId(e.target.value ? parseInt(e.target.value, 10) : "")}
            >
              <option value="">
                {comptesLoading ? "— Chargement des comptes —" : "— Choisir un compte —"}
              </option>
              {comptes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.banque})
                  {c.numero_compte ? ` ···${c.numero_compte.slice(-4)}` : ""}
                  {" — "}
                  {new Intl.NumberFormat("fr-FR").format(parseFloat(c.solde_actuel_fcfa))} FCFA
                </option>
              ))}
            </select>
          </div>
          {comptesError && (
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-red-600">
              <span>Impossible de charger les comptes bancaires.</span>
              <button type="button" onClick={onRetryComptes} className="font-medium underline">
                Réessayer
              </button>
            </div>
          )}
          {!comptesLoading && !comptesError && comptes.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Aucun compte bancaire actif n'est disponible pour cet encaissement.
            </p>
          )}
          {!comptesLoading && !comptesError && comptes.length > 1 && !compteSelectionne && (
            <p className="mt-1 text-xs text-amber-700">Sélectionnez le compte à débiter.</p>
          )}
        </Field>
        <Field label="Date d'encaissement *">
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none"
              value={dateEncaissement}
              onChange={e => setDateEncaissement(e.target.value)}
            />
          </div>
        </Field>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
          Annuler
        </button>
        <button
           onClick={() => {
             if (compteSelectionne) onSubmit({ compteBancaireId: compteSelectionne.id, dateEncaissement });
           }}
           disabled={isPending || !peutConfirmer}
          className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />} Confirmer l'encaissement
        </button>
      </div>
    </ModalShell>
  );
}

// ── Rejeter chèque ────────────────────────────────────────────────────────────

function ModalRejeter({
  cheque, onClose, onSubmit, isPending, error,
}: {
  cheque: Cheque; onClose: () => void;
  onSubmit: (d: { motifRejet: string; dateRejet?: string }) => void;
  isPending: boolean; error?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [motifRejet, setMotifRejet] = useState("");
  const [dateRejet, setDateRejet] = useState(today);

  return (
    <ModalShell title="Rejeter le chèque" onClose={onClose}>
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 space-y-1">
        <p className="font-semibold">Ce chèque sera marqué comme rejeté.</p>
        <p>Le paiement associé sera remis en attente pour permettre un nouveau règlement.</p>
        <p className="mt-1 font-medium">{cheque.beneficiaire} — {new Intl.NumberFormat("fr-FR").format(cheque.montantFcfa)} FCFA</p>
      </div>
      <div className="space-y-3">
        <Field label="Motif de rejet *">
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            rows={3}
            placeholder="Provision insuffisante, signature non conforme…"
            value={motifRejet}
            onChange={e => setMotifRejet(e.target.value)}
          />
        </Field>
        <Field label="Date de rejet">
          <input
            type="date"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
            value={dateRejet}
            onChange={e => setDateRejet(e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
          Annuler
        </button>
        <button
          onClick={() => onSubmit({ motifRejet, dateRejet })}
          disabled={isPending || !motifRejet.trim()}
          className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />} Confirmer le rejet
        </button>
      </div>
    </ModalShell>
  );
}

// ── Annuler chèque ────────────────────────────────────────────────────────────

function ModalAnnuler({
  cheque, onClose, onSubmit, isPending, error,
}: {
  cheque: Cheque; onClose: () => void;
  onSubmit: (d: { motifAnnulation: string }) => void;
  isPending: boolean; error?: string;
}) {
  const [motifAnnulation, setMotifAnnulation] = useState("");

  return (
    <ModalShell title="Annuler le chèque" onClose={onClose}>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-1">
        <p className="font-semibold">Annuler ce chèque n'affecte pas le compte bancaire.</p>
        <p>Le paiement reste dans son statut actuel. Utilisez cette option si le chèque ne sera pas présenté.</p>
        <p className="font-medium mt-1">{cheque.beneficiaire} — {new Intl.NumberFormat("fr-FR").format(cheque.montantFcfa)} FCFA</p>
      </div>
      <Field label="Motif d'annulation *">
        <textarea
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
          rows={3}
          placeholder="Chèque remplacé, erreur de montant…"
          value={motifAnnulation}
          onChange={e => setMotifAnnulation(e.target.value)}
        />
      </Field>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
          Retour
        </button>
        <button
          onClick={() => onSubmit({ motifAnnulation })}
          disabled={isPending || !motifAnnulation.trim()}
          className="flex-1 bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />} Annuler le chèque
        </button>
      </div>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

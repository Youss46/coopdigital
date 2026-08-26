import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Users, Search, Phone, MapPin, Wallet, PlusCircle, X,
  ChevronRight, AlertCircle, CalendarDays, TrendingUp, Settings,
  CheckCircle2, Clock, Banknote, Trash2, ArrowDownCircle, Package,
  Download, ShoppingCart, Truck, Pencil, History,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { MoneyInput } from "@/components/ui/money-input";
import { usePermission } from "@/hooks/usePermission";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
  return r.json();
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
  return r.json();
}
async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
  return r.json();
}
async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok && r.status !== 204) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
}

interface MembreDelegue {
  id: number;
  nom: string;
  prenoms: string | null;
  telephone: string;
  section: string | null;
  village: string | null;
  categorieMembre: string | null;
  statutMembre: string;
  numeroMembre: number;
}

interface Avance {
  id: number;
  membreId: number;
  montantOctroyeFcfa: number;
  montantRembourseFcfa: number;
  soldeRestantFcfa: number;
  statut: "en_cours" | "rembourse" | "en_retard";
  dateOctroi: string;
  dateEcheance: string | null;
  motif: string | null;
  planType: "integral" | "partiel" | "reporte";
  montantPartielFcfa: number | null;
  reportDate: string | null;
}

interface RemboursementAvance {
  id: number;
  montantFcfa: number;
  note: string | null;
  createdAt: string;
  commissionMembreDelegueId: number | null;
}

interface CommissionRecap {
  membreId: number;
  nom: string;
  prenoms: string | null;
  section: string | null;
  village: string | null;
  enAttenteFcfa: number;
  totalPayeFcfa: number;
  totalFcfa: number;
  nb: number;
}

interface Commission {
  id: number;
  membreDelegueId: number;
  sessionPeseeId: number | null;
  campagneId: number | null;
  tauxFcfaParKg: number;
  poidsKg: number;
  montantFcfa: number;
  retenueAvancesFcfa: number;
  statut: string;
  datePaiement: string | null;
  modePaiement: string | null;
  referencePaiement: string | null;
  createdAt: string;
}

interface TauxCommission {
  id: number;
  cooperativeId: number;
  campagneId: number | null;
  membreDelegueId: number | null;
  tauxFcfaParKg: number;
  dateDebut: string;
  dateFin: string | null;
  actif: boolean;
  membreNom: string | null;
  membrePrenoms: string | null;
  campagneLibelle: string | null;
}

interface Campagne {
  id: number;
  libelle: string;
  statut: string;
}

interface LivraisonMembre {
  id: number;
  poidsKg: string;
  prixUnitaireFcfa: number;
  montantBrutFcfa: number;
  avanceDeduiteFcfa: number;
  montantNetFcfa: number;
  dateLivraison: string;
  statutPaiement: string | null;
}

interface LivraisonDelegue {
  id: number;
  membreId: number | null;
  poidsKg: string;
  montantBrutFcfa: number;
  avanceDeduiteFcfa: number;
  montantNetFcfa: number;
  dateLivraison: string;
  statutPaiement: string | null;
  membreNom: string | null;
  membrePrenoms: string | null;
}

async function downloadBordereau(livraisonId: number) {
  const url = `${BASE}/api/rapports/recu/livraison/${livraisonId}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok) return;
  const blob = await r.blob();
  if (!blob.size) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bordereau-livraison-${livraisonId}.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function formaterMontant(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " F";
}
function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function TableauChargement({ colonnes }: { colonnes: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <tbody>
          <TableSkeleton colonnes={colonnes} />
        </tbody>
      </table>
    </div>
  );
}

type Onglet = "membres" | "avances" | "commissions" | "taux" | "livraisons";
type FiltreStatutLivraison = "tous" | "EN_ATTENTE" | "PAYÉ";

export default function DeleguesLocalitesPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { utilisateur } = useAuth();
  const isMagasinier = utilisateur?.role === "magasinier";
  const peutLireAvances = usePermission("avances", "lire");
  const peutOctroyer   = usePermission("avances", "octroyer");
  const peutRembourser = usePermission("avances", "rembourser");
  const peutPayerCommissions = usePermission("commissions_delegues", "payer");
  const peutGererTaux = usePermission("commissions_delegues", "gerer_taux");

  const [onglet, setOnglet] = useState<Onglet>("membres");
  const [search, setSearch] = useState("");
  const [filtreLivraisons, setFiltreLivraisons] = useState<FiltreStatutLivraison>("tous");
  const [searchLivraisons, setSearchLivraisons] = useState("");
  const [modalMembre, setModalMembre] = useState<MembreDelegue | null>(null);
  const [membreAvancesId, setMembreAvancesId] = useState<number | null>(null);
  const [showOctroi, setShowOctroi] = useState(false);
  const [formOctroi, setFormOctroi] = useState({
    montant: "", dateOctroi: new Date().toISOString().split("T")[0]!, dateEcheance: "", motif: "",
    modePaiement: "especes" as "especes" | "mobile" | "banque",
    planType: "integral" as Avance["planType"], montantPartiel: "", reportDate: "",
  });
  const [errOctroi, setErrOctroi] = useState("");

  // Remboursement manuel d'une avance
  const [rembourserAvanceId, setRembourserAvanceId] = useState<number | null>(null);
  const [formRembours, setFormRembours] = useState({ montant: "", note: "" });
  const [errRembours, setErrRembours] = useState("");
  const [avancePlanEdition, setAvancePlanEdition] = useState<Avance | null>(null);
  const [formPlan, setFormPlan] = useState({ planType: "integral" as Avance["planType"], montantPartiel: "", reportDate: "" });
  const [errPlan, setErrPlan] = useState("");
  const [avanceHistoriqueId, setAvanceHistoriqueId] = useState<number | null>(null);

  // ── Commission : modal paiement ───────────────────────────────────────────
  const [modalCommission, setModalCommission] = useState<CommissionRecap | null>(null);
  const [detailCommissions, setDetailCommissions] = useState<Commission[]>([]);
  const [avancesModalComm, setAvancesModalComm] = useState<Avance[]>([]);
  const [formPayer, setFormPayer] = useState({ modePaiement: "especes", referencePaiement: "" });
  const [errPayer, setErrPayer] = useState("");

  // ── Taux : formulaire ─────────────────────────────────────────────────────
  const [showTauxForm, setShowTauxForm] = useState(false);
  const [tauxEnEditionId, setTauxEnEditionId] = useState<number | null>(null);
  const [formTaux, setFormTaux] = useState({
    campagneId: "" as string,
    membreDelegueId: "" as string,
    tauxFcfaParKg: "",
    dateDebut: new Date().toISOString().split("T")[0]!,
    dateFin: "",
    actif: true,
  });
  const [errTaux, setErrTaux] = useState("");

  // ── Data fetching ─────────────────────────────────────────────────────────
  // Magasinier uses a narrow identity-only endpoint (stocks.lire);
  // other roles use the full membres endpoint (membres.lire).
  const { data: resultatMagasinier, isLoading: loadingMagasinier } = useQuery<MembreDelegue[]>({
    queryKey: ["delegues-localites-magasinier"],
    queryFn: () => apiFetch<MembreDelegue[]>(`/api/pesee/membres-delegues`),
    enabled: isMagasinier,
    staleTime: 30_000,
  });

  const { data: resultatComplet, isLoading: loadingComplet } = useQuery<{ membres: MembreDelegue[]; total: number }>({
    queryKey: ["delegues-localites"],
    queryFn: () => apiFetch<{ membres: MembreDelegue[]; total: number }>(`/api/membres?categorie_membre=d%C3%A9l%C3%A9gu%C3%A9+de+localit%C3%A9s&limit=200&statut_membre=actif`),
    enabled: !isMagasinier,
    staleTime: 30_000,
  });

  const isLoading = isMagasinier ? loadingMagasinier : loadingComplet;
  const membres: MembreDelegue[] = isMagasinier
    ? (resultatMagasinier ?? [])
    : (resultatComplet?.membres ?? []);

  const { data: toutesAvances = [] } = useQuery<Avance[]>({
    queryKey: ["avances-delegues-localites"],
    queryFn: () => apiFetch<{ avances: Avance[]; total: number }>(`/api/delegues-localites/avances`).then(r => r.avances ?? []),
    enabled: !isMagasinier,
    staleTime: 30_000,
  });

  const avancesParMembre = new Map<number, Avance[]>();
  for (const a of toutesAvances) {
    if (!avancesParMembre.has(a.membreId)) avancesParMembre.set(a.membreId, []);
    avancesParMembre.get(a.membreId)!.push(a);
  }

  function soldeAvances(membreId: number): number {
    return (avancesParMembre.get(membreId) ?? [])
      .filter(a => a.statut !== "rembourse")
      .reduce((s, a) => s + a.soldeRestantFcfa, 0);
  }

  const { data: avancesModal = [], isLoading: loadAvances } = useQuery<Avance[]>({
    queryKey: ["avances-membre", modalMembre?.id],
    queryFn: () => apiFetch<{ avances: Avance[]; total: number }>(`/api/delegues-localites/${modalMembre!.id}/avances`).then(r => r.avances ?? []),
    enabled: !!modalMembre && !isMagasinier,
    staleTime: 0,
  });

  const { data: avancesMembreSelectionne = [], isLoading: loadAvancesMembreSelectionne } = useQuery<Avance[]>({
    queryKey: ["avances-delegue-localite", membreAvancesId],
    queryFn: () => apiFetch<{ avances: Avance[]; total: number }>(`/api/delegues-localites/${membreAvancesId}/avances`).then(r => r.avances ?? []),
    enabled: onglet === "avances" && membreAvancesId !== null,
    staleTime: 0,
  });

  const { data: avancesReportees = { avances: [], total: 0, soldeTotal: 0 } } = useQuery<{
    avances: Avance[];
    total: number;
    soldeTotal: number;
  }>({
    queryKey: ["avances-delegues-localites-reportees"],
    queryFn: () => apiFetch("/api/delegues-localites/avances-reportees"),
    enabled: onglet === "avances" && !isMagasinier,
    staleTime: 30_000,
  });

  const membreCibleAvanceId = modalMembre?.id ?? membreAvancesId ?? null;
  const { data: remboursementsHistorique = [], isLoading: loadHistorique } = useQuery<RemboursementAvance[]>({
    queryKey: ["remboursements-avance-delegue-localite", membreCibleAvanceId, avanceHistoriqueId],
    queryFn: () => apiFetch(`/api/delegues-localites/${membreCibleAvanceId}/avances/${avanceHistoriqueId}/remboursements`),
    enabled: membreCibleAvanceId !== null && avanceHistoriqueId !== null,
    staleTime: 0,
  });

  const { data: livraisonsModal = [], isLoading: loadLivraisons } = useQuery<LivraisonMembre[]>({
    queryKey: ["livraisons-membre-delegue", modalMembre?.id],
    queryFn: () => apiFetch(`/api/livraisons?membre_id=${modalMembre!.id}&limit=20`),
    enabled: !!modalMembre,
    staleTime: 0,
  });

  const { data: recapCommissions = [], isLoading: loadRecap } = useQuery<CommissionRecap[]>({
    queryKey: ["commissions-membres-delegues-recap"],
    queryFn: () => apiFetch(`/api/delegues-localites/commissions/recap`),
    enabled: onglet === "commissions",
    staleTime: 30_000,
  });

  const { data: taux = [], isLoading: loadTaux } = useQuery<TauxCommission[]>({
    queryKey: ["commissions-membres-delegues-taux"],
    queryFn: () => apiFetch(`/api/delegues-localites/commissions/taux`),
    enabled: onglet === "taux",
    staleTime: 30_000,
  });

  const { data: campagnes = [] } = useQuery<Campagne[]>({
    queryKey: ["campagnes"],
    queryFn: () => apiFetch<Campagne[]>("/api/campagnes"),
    enabled: onglet === "taux",
    staleTime: 30_000,
  });

  const { data: livraisonsDelegues = [], isLoading: loadLivraisonsDelegues } = useQuery<LivraisonDelegue[]>({
    queryKey: ["livraisons-membres-delegues"],
    queryFn: () => apiFetch(`/api/livraisons?categorie_membre_delegue=true`),
    enabled: onglet === "livraisons" && !isMagasinier,
    staleTime: 30_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const mutOctroyer = useMutation({
    mutationFn: () => apiPost(`/api/delegues-localites/${membreCibleAvanceId}/avances`, {
      montantOctroyeFcfa: parseInt(formOctroi.montant),
      dateOctroi: formOctroi.dateOctroi,
      dateEcheance: formOctroi.dateEcheance || undefined,
      motif: formOctroi.motif || undefined,
      modePaiement: formOctroi.modePaiement,
      planType: formOctroi.planType,
      montantPartielFcfa: formOctroi.planType === "partiel" ? Number(formOctroi.montantPartiel) : undefined,
      reportDate: formOctroi.planType === "reporte" ? formOctroi.reportDate : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avances-membre", modalMembre?.id] });
      qc.invalidateQueries({ queryKey: ["avances-delegue-localite", membreAvancesId] });
      qc.invalidateQueries({ queryKey: ["avances-delegues-localites"] });
      qc.invalidateQueries({ queryKey: ["avances-delegues-localites-reportees"] });
      setShowOctroi(false);
      setFormOctroi({ montant: "", dateOctroi: new Date().toISOString().split("T")[0]!, dateEcheance: "", motif: "", modePaiement: "especes", planType: "integral", montantPartiel: "", reportDate: "" });
      setErrOctroi("");
    },
    onError: (e: Error) => setErrOctroi(e.message),
  });

  const mutRembourser = useMutation({
    mutationFn: (avanceId: number) =>
      apiPost(`/api/delegues-localites/${membreCibleAvanceId}/avances/${avanceId}/rembourser`, {
        montantFcfa: parseInt(formRembours.montant),
        note: formRembours.note || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avances-membre", modalMembre?.id] });
      qc.invalidateQueries({ queryKey: ["avances-delegue-localite", membreAvancesId] });
      qc.invalidateQueries({ queryKey: ["avances-delegues-localites"] });
      qc.invalidateQueries({ queryKey: ["remboursements-avance-delegue-localite", membreCibleAvanceId] });
      setRembourserAvanceId(null);
      setFormRembours({ montant: "", note: "" });
      setErrRembours("");
    },
    onError: (e: Error) => setErrRembours(e.message),
  });

  const mutModifierPlan = useMutation({
    mutationFn: () => {
      const avance = avancePlanEdition!;
      return fetch(`${BASE}/api/delegues-localites/${membreCibleAvanceId}/avances/${avance.id}/plan`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({
          plan_type: formPlan.planType,
          montant_partiel_fcfa: formPlan.planType === "partiel" ? Number(formPlan.montantPartiel) : null,
          report_date: formPlan.planType === "reporte" ? formPlan.reportDate : null,
        }),
      }).then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur ?? r.statusText);
        return r.json();
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avances-membre", modalMembre?.id] });
      qc.invalidateQueries({ queryKey: ["avances-delegue-localite", membreAvancesId] });
      qc.invalidateQueries({ queryKey: ["avances-delegues-localites"] });
      qc.invalidateQueries({ queryKey: ["avances-delegues-localites-reportees"] });
      setAvancePlanEdition(null);
      setErrPlan("");
    },
    onError: (e: Error) => setErrPlan(e.message),
  });

  const mutPayer = useMutation({
    mutationFn: () => apiPost<{ montantTotal: number; totalRetenu: number; montantNet: number; nb: number }>(
      `/api/delegues-localites/${modalCommission!.membreId}/commissions/payer`, {
        modePaiement: formPayer.modePaiement,
        referencePaiement: formPayer.referencePaiement || undefined,
      }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commissions-membres-delegues-recap"] });
      qc.invalidateQueries({ queryKey: ["avances-delegues-localites"] });
      setModalCommission(null);
      setDetailCommissions([]);
      setAvancesModalComm([]);
      setErrPayer("");
    },
    onError: (e: Error) => setErrPayer(e.message),
  });

  const mutAjouterTaux = useMutation({
    mutationFn: () => apiPost("/api/delegues-localites/commissions/taux", {
      id: tauxEnEditionId ?? undefined,
      campagneId: formTaux.campagneId ? Number(formTaux.campagneId) : null,
      membreDelegueId: formTaux.membreDelegueId ? Number(formTaux.membreDelegueId) : null,
      tauxFcfaParKg: Number(formTaux.tauxFcfaParKg),
      dateDebut: formTaux.dateDebut,
      dateFin: formTaux.dateFin || null,
      actif: formTaux.actif,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commissions-membres-delegues-taux"] });
      setShowTauxForm(false);
      setTauxEnEditionId(null);
      setFormTaux({ campagneId: "", membreDelegueId: "", tauxFcfaParKg: "", dateDebut: new Date().toISOString().split("T")[0]!, dateFin: "", actif: true });
      setErrTaux("");
    },
    onError: (e: Error) => setErrTaux(e.message),
  });

  const mutSupprimerTaux = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/delegues-localites/commissions/taux/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commissions-membres-delegues-taux"] }),
    onError: (e: Error) => setErrTaux(e.message),
  });

  function ouvrirNouveauTaux() {
    const campagneActive = campagnes.find(c => c.statut === "en_cours");
    setTauxEnEditionId(null);
    setFormTaux({
      campagneId: campagneActive ? String(campagneActive.id) : "",
      membreDelegueId: "",
      tauxFcfaParKg: "",
      dateDebut: new Date().toISOString().split("T")[0]!,
      dateFin: "",
      actif: true,
    });
    setErrTaux("");
    setShowTauxForm(true);
  }

  function ouvrirEditionTaux(taux: TauxCommission) {
    setTauxEnEditionId(taux.id);
    setFormTaux({
      campagneId: taux.campagneId ? String(taux.campagneId) : "",
      membreDelegueId: taux.membreDelegueId ? String(taux.membreDelegueId) : "",
      tauxFcfaParKg: String(taux.tauxFcfaParKg),
      dateDebut: taux.dateDebut,
      dateFin: taux.dateFin ?? "",
      actif: taux.actif,
    });
    setErrTaux("");
    setShowTauxForm(true);
  }

  function fermerFormulaireTaux() {
    setShowTauxForm(false);
    setTauxEnEditionId(null);
    setErrTaux("");
  }

  // ── Chargement détail commissions pour modal paiement ─────────────────────
  async function ouvrirModalCommission(recap: CommissionRecap) {
    setModalCommission(recap);
    setErrPayer("");
    setAvancesModalComm([]);
    try {
      const [commData, avancesData] = await Promise.all([
        apiFetch<Commission[]>(`/api/delegues-localites/${recap.membreId}/commissions`),
        apiFetch<{ avances: Avance[]; total: number }>(`/api/delegues-localites/${recap.membreId}/avances`).then(r => r.avances ?? []),
      ]);
      setDetailCommissions(commData.filter(c => c.statut === "en_attente"));
      setAvancesModalComm(avancesData.filter(a => a.statut !== "rembourse"));
    } catch {
      setDetailCommissions([]);
    }
  }

  // ── Filtrage ──────────────────────────────────────────────────────────────
  const filtres = membres.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.nom.toLowerCase().includes(q) ||
      (m.prenoms ?? "").toLowerCase().includes(q) ||
      m.telephone.includes(q) ||
      (m.section ?? "").toLowerCase().includes(q) ||
      (m.village ?? "").toLowerCase().includes(q)
    );
  });

  const totalEnAttente = recapCommissions.reduce((s, r) => s + r.enAttenteFcfa, 0);
  const membreAvancesSelectionne = membres.find(m => m.id === membreAvancesId) ?? null;
  const planLibelle = (avance: Pick<Avance, "planType" | "montantPartielFcfa" | "reportDate">) => {
    if (avance.planType === "partiel") {
      return `Partiel — ${formaterMontant(avance.montantPartielFcfa ?? 0)} par paiement`;
    }
    if (avance.planType === "reporte") {
      return `Reporté jusqu’au ${avance.reportDate ? formaterDate(avance.reportDate) : "nouvel ordre"}`;
    }
    return "Intégral au prochain paiement";
  };

  return (
    <div className="space-y-5 sm:space-y-6 p-4 sm:p-6 max-w-5xl mx-auto min-w-0">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Délégués de localités</h1>
          <p className="text-sm text-gray-500 mt-0.5 leading-5">
            Membres de catégorie "Délégué de localités" — {membres.length} au total
          </p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {([
          { id: "membres" as Onglet,     label: "Membres",     icon: Users,      hidden: false },
          { id: "avances" as Onglet,      label: "Avances",     icon: Wallet,     hidden: isMagasinier || !peutLireAvances },
          { id: "livraisons" as Onglet,  label: "Livraisons",  icon: Truck,      hidden: isMagasinier },
          { id: "commissions" as Onglet, label: "Commissions", icon: TrendingUp, hidden: isMagasinier },
          { id: "taux" as Onglet,        label: "Taux",        icon: Settings,   hidden: isMagasinier },
        ] as const).filter(t => !t.hidden).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setOnglet(id)}
            className={`flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              onglet === id
                ? "border-[#1a4731] text-[#1a4731]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Onglet Membres ────────────────────────────────────────────────── */}
      {onglet === "membres" && (
        <>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Nom, téléphone, section, village…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1a4731] focus:border-[#1a4731]"
            />
          </div>

          {isLoading ? (
            <TableauChargement colonnes={4} />
          ) : filtres.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icone={Users}
                titre={search ? "Aucun résultat" : "Aucun délégué de localités"}
                description={
                  search
                    ? "Modifiez votre recherche."
                    : "Créez des membres avec la catégorie \"Délégué de localités\" depuis la page Membres."
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtres.map(m => {
                const solde = soldeAvances(m.id);
                const avancesM = avancesParMembre.get(m.id) ?? [];
                const enRetard = avancesM.some(a => a.statut === "en_retard");
                return (
                  <div
                    key={m.id}
                    className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex items-start gap-3 hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <div
                      className="w-10 h-10 rounded-full bg-[#1a4731]/10 flex items-center justify-center shrink-0 cursor-pointer"
                      onClick={() => setModalMembre(m)}
                    >
                      <span className="text-sm font-bold text-[#1a4731]">
                        {(m.prenoms ?? m.nom).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setModalMembre(m)}>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{m.prenoms} {m.nom}</p>
                        {enRetard && <AlertCircle size={13} className="text-red-500 shrink-0" />}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone size={10} /> {m.telephone}
                        </span>
                        {(m.section || m.village) && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin size={10} /> {m.section ?? m.village}
                          </span>
                        )}
                      </div>
                      {solde > 0 && (
                        <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          enRetard ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                        }`}>
                          <Wallet size={10} />
                          {formaterMontant(solde)} d'avances
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        title="Créer un bon de réception"
                        onClick={() => setLocation(`/bons-reception-membres?membre_id=${m.id}`)}
                        className="flex items-center gap-1 text-xs font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg px-1.5 sm:px-2 py-1 transition-colors"
                      >
                        <Package size={12} />
                        <span className="hidden sm:inline">Bon de réception</span>
                      </button>
                      <ChevronRight size={15} className="text-gray-300 cursor-pointer" onClick={() => setModalMembre(m)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Onglet Avances ────────────────────────────────────────────────── */}
      {onglet === "avances" && (
        <section className="space-y-4">
          {avancesReportees.total > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {avancesReportees.total} avance{avancesReportees.total > 1 ? "s" : ""} reportée{avancesReportees.total > 1 ? "s" : ""} à reprendre
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {formaterMontant(avancesReportees.soldeTotal)} restent à recouvrer sur les prochaines commissions.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <select
              value={membreAvancesId ?? ""}
              onChange={e => {
                setMembreAvancesId(e.target.value ? Number(e.target.value) : null);
                setShowOctroi(false);
                setRembourserAvanceId(null);
                setAvanceHistoriqueId(null);
              }}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
            >
              <option value="">— Sélectionner un délégué de localités —</option>
              {membres.map(m => (
                <option key={m.id} value={m.id}>
                  {m.prenoms} {m.nom}{m.section ? ` — ${m.section}` : m.village ? ` — ${m.village}` : ""}
                </option>
              ))}
            </select>
            {membreAvancesId !== null && peutOctroyer && (
              <button
                onClick={() => { setErrOctroi(""); setShowOctroi(true); }}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#1a4731] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#123525]"
              >
                <PlusCircle size={15} /> Octroyer une avance
              </button>
            )}
          </div>

          {!membreAvancesId ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icone={Wallet}
                titre="Sélectionnez un délégué de localités"
                description="Vous pourrez consulter ses avances, choisir un plan de retenue et suivre les remboursements sur ses commissions."
              />
            </div>
          ) : (
            <>
              {showOctroi && (
                <div className="bg-white border border-[#1a4731]/20 rounded-xl p-4 sm:p-5 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-[#1a4731]">Nouvelle avance</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      La retenue sera appliquée uniquement lors du paiement des commissions de {membreAvancesSelectionne?.prenoms} {membreAvancesSelectionne?.nom}.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Montant (FCFA) *</label>
                      <MoneyInput min="1" value={formOctroi.montant} onChange={value => setFormOctroi(f => ({ ...f, montant: value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Date d’octroi *</label>
                      <input type="date" value={formOctroi.dateOctroi} onChange={e => setFormOctroi(f => ({ ...f, dateOctroi: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Échéance (facultative)</label>
                      <input type="date" value={formOctroi.dateEcheance} onChange={e => setFormOctroi(f => ({ ...f, dateEcheance: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Motif (facultatif)</label>
                      <input type="text" value={formOctroi.motif} onChange={e => setFormOctroi(f => ({ ...f, motif: e.target.value }))}
                        placeholder="Ex. déplacement ou frais de collecte"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-600 mb-1">Mode de décaissement *</label>
                      <select
                        value={formOctroi.modePaiement}
                        onChange={e => setFormOctroi(f => ({ ...f, modePaiement: e.target.value as typeof f.modePaiement }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                      >
                        <option value="especes">Espèces — caisse (571)</option>
                        <option value="mobile">Mobile Marchand (552)</option>
                        <option value="banque">Banque (521)</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-600 mb-1">Plan de retenue *</label>
                      <select value={formOctroi.planType} onChange={e => setFormOctroi(f => ({ ...f, planType: e.target.value as Avance["planType"] }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]">
                        <option value="integral">Intégral — retenir le maximum au prochain paiement</option>
                        <option value="partiel">Partiel — retenir un montant défini à chaque paiement</option>
                        <option value="reporte">Reporté — ne retenir qu’à partir d’une date</option>
                      </select>
                    </div>
                    {formOctroi.planType === "partiel" && (
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Montant par paiement (FCFA) *</label>
                        <MoneyInput min="1" value={formOctroi.montantPartiel} onChange={value => setFormOctroi(f => ({ ...f, montantPartiel: value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]" />
                      </div>
                    )}
                    {formOctroi.planType === "reporte" && (
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Date de reprise *</label>
                        <input type="date" value={formOctroi.reportDate} onChange={e => setFormOctroi(f => ({ ...f, reportDate: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]" />
                      </div>
                    )}
                  </div>
                  {errOctroi && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {errOctroi}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => mutOctroyer.mutate()}
                      disabled={!formOctroi.montant || (formOctroi.planType === "partiel" && !formOctroi.montantPartiel) || (formOctroi.planType === "reporte" && !formOctroi.reportDate) || mutOctroyer.isPending}
                      className="bg-[#1a4731] text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                      {mutOctroyer.isPending ? "Enregistrement…" : "Enregistrer l’avance"}
                    </button>
                    <button onClick={() => { setShowOctroi(false); setErrOctroi(""); }} className="px-4 text-sm text-gray-500 hover:text-gray-700">Annuler</button>
                  </div>
                </div>
              )}

              {loadAvancesMembreSelectionne ? (
                <TableauChargement colonnes={6} />
              ) : avancesMembreSelectionne.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200">
                  <EmptyState icone={Wallet} titre="Aucune avance enregistrée" description="Les avances de ce délégué de localités apparaîtront ici." />
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                  <table className="w-full min-w-[800px] text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Octroyée</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Plan de retenue</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Remboursée</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Solde</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {avancesMembreSelectionne.map(a => {
                        const active = a.statut !== "rembourse";
                        const rembourseEnCours = rembourserAvanceId === a.id;
                        const historiqueOuvert = avanceHistoriqueId === a.id;
                        return (
                          <>
                            <tr key={a.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <p className="font-semibold text-gray-900">{formaterMontant(a.montantOctroyeFcfa)}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{formaterDate(a.dateOctroi)}{a.motif ? ` · ${a.motif}` : ""}</p>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600">{planLibelle(a)}</td>
                              <td className="px-4 py-3 text-right text-gray-600">{formaterMontant(a.montantRembourseFcfa)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-amber-700">{formaterMontant(a.soldeRestantFcfa)}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                  a.statut === "rembourse" ? "bg-gray-100 text-gray-500" : a.statut === "en_retard" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
                                }`}>
                                  {a.statut === "rembourse" ? "Remboursée" : a.statut === "en_retard" ? "En retard" : "En cours"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => setAvanceHistoriqueId(historiqueOuvert ? null : a.id)} className="text-xs font-medium text-gray-500 hover:text-[#1a4731]">
                                    <History size={13} className="inline mr-1" /> Historique
                                  </button>
                                  {active && peutRembourser && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setAvancePlanEdition(a);
                                          setFormPlan({ planType: a.planType, montantPartiel: a.montantPartielFcfa ? String(a.montantPartielFcfa) : "", reportDate: a.reportDate ?? "" });
                                          setErrPlan("");
                                        }}
                                        className="text-xs font-medium text-[#1a4731] hover:underline"
                                      >
                                        Plan
                                      </button>
                                      <button
                                        onClick={() => { setRembourserAvanceId(rembourseEnCours ? null : a.id); setFormRembours({ montant: String(a.soldeRestantFcfa), note: "" }); setErrRembours(""); }}
                                        className="text-xs font-medium text-[#1a4731] hover:underline"
                                      >
                                        Rembourser
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {rembourseEnCours && (
                              <tr key={`${a.id}-remboursement`} className="bg-amber-50/50">
                                <td colSpan={6} className="px-4 py-3">
                                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                                    <div className="w-full sm:w-48">
                                      <label className="block text-xs text-gray-600 mb-1">Montant (FCFA)</label>
                                      <MoneyInput min="1" max={a.soldeRestantFcfa} value={formRembours.montant} onChange={value => setFormRembours(f => ({ ...f, montant: value }))}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-xs text-gray-600 mb-1">Note (facultative)</label>
                                      <input type="text" value={formRembours.note} onChange={e => setFormRembours(f => ({ ...f, note: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" placeholder="Précision sur le remboursement" />
                                    </div>
                                    <button onClick={() => mutRembourser.mutate(a.id)} disabled={!formRembours.montant || mutRembourser.isPending}
                                      className="bg-[#1a4731] text-white text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-50">
                                      {mutRembourser.isPending ? "…" : "Confirmer"}
                                    </button>
                                    <button onClick={() => { setRembourserAvanceId(null); setErrRembours(""); }} className="text-xs text-gray-500 px-2 py-2">Annuler</button>
                                  </div>
                                  {errRembours && <p className="mt-2 text-xs text-red-600">{errRembours}</p>}
                                </td>
                              </tr>
                            )}
                            {historiqueOuvert && (
                              <tr key={`${a.id}-historique`} className="bg-gray-50">
                                <td colSpan={6} className="px-4 py-3">
                                  <p className="text-xs font-semibold text-gray-700 mb-2">Historique des remboursements</p>
                                  {loadHistorique ? <p className="text-xs text-gray-400">Chargement…</p> : remboursementsHistorique.length === 0 ? (
                                    <p className="text-xs text-gray-400">Aucun remboursement enregistré.</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {remboursementsHistorique.map(r => (
                                        <div key={r.id} className="flex justify-between text-xs text-gray-600">
                                          <span>{formaterDate(r.createdAt)} · {r.note ?? (r.commissionMembreDelegueId ? "Retenue sur commission" : "Remboursement manuel")}</span>
                                          <strong>{formaterMontant(r.montantFcfa)}</strong>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={2} className="px-4 py-3 text-xs font-medium text-gray-500">{avancesMembreSelectionne.length} avance{avancesMembreSelectionne.length > 1 ? "s" : ""}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-700">{formaterMontant(avancesMembreSelectionne.reduce((s, a) => s + a.montantRembourseFcfa, 0))}</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700">{formaterMontant(avancesMembreSelectionne.filter(a => a.statut !== "rembourse").reduce((s, a) => s + a.soldeRestantFcfa, 0))}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ── Onglet Livraisons ─────────────────────────────────────────────── */}
      {onglet === "livraisons" && (() => {
        // Schema default is PAYÉ — null means the payment was immediate (paid).
        // Only explicit EN_ATTENTE or DIFFÉRÉ values mean unpaid.
        const STATUTS_NON_PAYES = new Set(["EN_ATTENTE", "EN ATTENTE", "DIFFERE", "DIFFÉRÉ"]);
        const isPaye = (s: string | null) =>
          s === null || !STATUTS_NON_PAYES.has((s).toUpperCase().trim());

        const filtrées = livraisonsDelegues.filter(l => {
          const matchStatut =
            filtreLivraisons === "tous" ? true :
            filtreLivraisons === "PAYÉ" ? isPaye(l.statutPaiement) :
            /* EN_ATTENTE */ !isPaye(l.statutPaiement);
          const nom = `${l.membrePrenoms ?? ""} ${l.membreNom ?? ""}`.toLowerCase();
          const matchSearch = !searchLivraisons || nom.includes(searchLivraisons.toLowerCase());
          return matchStatut && matchSearch;
        });

        const totalEnAttenteLiv = livraisonsDelegues
          .filter(l => !isPaye(l.statutPaiement))
          .reduce((s, l) => s + l.montantNetFcfa, 0);

        return (
          <>
            {/* Bannière total en attente */}
            {totalEnAttenteLiv > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                <Clock size={18} className="text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {formaterMontant(totalEnAttenteLiv)} en attente de paiement
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Livraisons issues des sessions membres-délégués non encore payées
                  </p>
                </div>
              </div>
            )}

            {/* Filtres */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher un membre…"
                  value={searchLivraisons}
                  onChange={e => setSearchLivraisons(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1a4731] focus:border-[#1a4731]"
                />
              </div>
              <div className="flex w-full sm:w-auto gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
                {(["tous", "EN_ATTENTE", "PAYÉ"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFiltreLivraisons(f)}
                    className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      filtreLivraisons === f
                        ? "bg-white text-[#1a4731] shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {f === "tous" ? "Tous" : f === "EN_ATTENTE" ? "En attente" : "Payé"}
                  </button>
                ))}
              </div>
            </div>

            {/* Tableau */}
            {loadLivraisonsDelegues ? (
              <TableauChargement colonnes={5} />
            ) : filtrées.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200">
                <EmptyState
                  icone={Truck}
                  titre="Aucune livraison"
                  description="Les livraisons des membres-délégués apparaîtront ici une fois enregistrées."
                />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Membre</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Poids (kg)</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Montant net</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtrées.map(l => {
                      const paye = isPaye(l.statutPaiement);
                      return (
                        <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">
                              {l.membrePrenoms} {l.membreNom}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                            {formaterDate(l.dateLivraison)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {Number(l.poidsKg).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-[#1a4731]">
                            {formaterMontant(l.montantNetFcfa)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              paye
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {paye ? "Payé" : "En attente"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              title="Télécharger le bordereau"
                              onClick={() => void downloadBordereau(l.id)}
                              className="p-1.5 text-gray-400 hover:text-[#1a4731] transition-colors"
                            >
                              <Download size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={3} className="px-4 py-3 text-xs text-gray-500 font-medium">
                        {filtrées.length} livraison{filtrées.length !== 1 ? "s" : ""}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {formaterMontant(filtrées.reduce((s, l) => s + l.montantNetFcfa, 0))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        );
      })()}

      {/* ── Onglet Commissions ────────────────────────────────────────────── */}
      {onglet === "commissions" && (
        <>
          {totalEnAttente > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <Clock size={18} className="text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {formaterMontant(totalEnAttente)} de commissions en attente
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Cliquez sur un délégué pour effectuer le paiement
                </p>
              </div>
            </div>
          )}

          {loadRecap ? (
            <TableauChargement colonnes={4} />
          ) : recapCommissions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icone={TrendingUp}
                titre="Aucune commission"
                description="Les commissions sont générées automatiquement à la clôture de chaque session de pesée pour les délégués de localités."
              />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Délégué</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">En attente</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total payé</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sessions</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recapCommissions.map(r => (
                    <tr key={r.membreId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.prenoms} {r.nom}</p>
                        {(r.section || r.village) && (
                          <p className="text-xs text-gray-400">{r.section ?? r.village}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.enAttenteFcfa > 0 ? (
                          <span className="font-semibold text-amber-700">{formaterMontant(r.enAttenteFcfa)}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{formaterMontant(r.totalPayeFcfa)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{r.nb}</td>
                      <td className="px-4 py-3 text-right">
                        {r.enAttenteFcfa > 0 && peutPayerCommissions && (
                          <button
                            onClick={() => ouvrirModalCommission(r)}
                            className="flex items-center gap-1 text-xs font-medium text-[#1a4731] hover:underline ml-auto"
                          >
                            <Banknote size={12} /> Payer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Onglet Taux ───────────────────────────────────────────────────── */}
      {onglet === "taux" && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Taux de commission FCFA/kg appliqués aux délégués de localités lors de la pesée.
            </p>
            {!showTauxForm && peutGererTaux && (
              <button
                onClick={ouvrirNouveauTaux}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#1a4731] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#123525]"
              >
                <PlusCircle size={14} /> Nouveau taux
              </button>
            )}
          </div>
          {errTaux && !showTauxForm && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12} /> {errTaux}
            </p>
          )}

          {/* Formulaire taux — même périmètre que les délégués terrain */}
          {showTauxForm && (
            <div className="bg-white border border-[#1a4731]/20 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-[#1a4731]">
                {tauxEnEditionId ? "Modifier le taux de commission" : "Nouveau taux de commission"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Campagne</label>
                  <select
                    value={formTaux.campagneId}
                    onChange={e => setFormTaux(f => ({ ...f, campagneId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                  >
                    <option value="">— Toutes les campagnes —</option>
                    {campagnes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.libelle}{c.statut === "en_cours" ? " ✓ En cours" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Délégué spécifique (laisser vide pour taux global)</label>
                  <select
                    value={formTaux.membreDelegueId}
                    onChange={e => setFormTaux(f => ({ ...f, membreDelegueId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                  >
                    <option value="">— Tous les délégués (taux global) —</option>
                    {membres.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.prenoms} {m.nom}
                        {m.section ? ` (${m.section})` : m.village ? ` — ${m.village}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Taux (FCFA / kg) *</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formTaux.tauxFcfaParKg}
                    onChange={e => setFormTaux(f => ({ ...f, tauxFcfaParKg: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                    placeholder="Ex : 5"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Date de début *</label>
                  <input
                    type="date"
                    value={formTaux.dateDebut}
                    onChange={e => setFormTaux(f => ({ ...f, dateDebut: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Date de fin (optionnel)</label>
                  <input
                    type="date"
                    value={formTaux.dateFin}
                    onChange={e => setFormTaux(f => ({ ...f, dateFin: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                  />
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formTaux.actif}
                    onChange={e => setFormTaux(f => ({ ...f, actif: e.target.checked }))}
                    className="accent-[#1a4731]"
                  />
                  Taux actif
                </label>
              </div>
              {errTaux && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {errTaux}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => mutAjouterTaux.mutate()}
                  disabled={!formTaux.tauxFcfaParKg || mutAjouterTaux.isPending}
                  className="bg-[#1a4731] text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {mutAjouterTaux.isPending ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button
                  onClick={fermerFormulaireTaux}
                  className="px-4 text-sm text-gray-500 hover:text-gray-700"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {loadTaux ? (
            <TableauChargement colonnes={4} />
          ) : taux.length === 0 && !showTauxForm ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icone={Settings}
                titre="Aucun taux configuré"
                description="Configurez un taux FCFA/kg pour activer le calcul automatique des commissions à la pesée."
              />
            </div>
          ) : taux.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Délégué</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Taux</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campagne</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Période</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {taux.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        {t.membreDelegueId ? (
                          <span className="font-medium text-gray-900">
                            {t.membrePrenoms} {t.membreNom}
                          </span>
                        ) : (
                          <span className="italic text-gray-500">Taux global (tous)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#1a4731]">
                        {t.tauxFcfaParKg} F/kg
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {t.campagneLibelle ?? <span className="text-gray-400">Toutes</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        À partir du {formaterDate(t.dateDebut)}
                        {t.dateFin && ` → ${formaterDate(t.dateFin)}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          t.actif ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {t.actif ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {peutGererTaux && (
                            <>
                              <button
                                onClick={() => ouvrirEditionTaux(t)}
                                className="text-gray-400 hover:text-[#1a4731] p-1 rounded"
                                title="Modifier le taux"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm("Supprimer ce taux de commission ?")) mutSupprimerTaux.mutate(t.id);
                                }}
                                className="text-red-400 hover:text-red-600 p-1 rounded"
                                title="Supprimer le taux"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      {avancePlanEdition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-gray-900">Modifier le plan de retenue</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Solde à recouvrer : {formaterMontant(avancePlanEdition.soldeRestantFcfa)}
                </p>
              </div>
              <button onClick={() => setAvancePlanEdition(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Plan de retenue</label>
                <select value={formPlan.planType} onChange={e => setFormPlan(f => ({ ...f, planType: e.target.value as Avance["planType"] }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="integral">Intégral au prochain paiement</option>
                  <option value="partiel">Partiel à chaque paiement</option>
                  <option value="reporte">Reporté à une date définie</option>
                </select>
              </div>
              {formPlan.planType === "partiel" && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Montant par paiement (FCFA) *</label>
                  <MoneyInput min="1" value={formPlan.montantPartiel} onChange={value => setFormPlan(f => ({ ...f, montantPartiel: value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
              {formPlan.planType === "reporte" && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Date de reprise *</label>
                  <input type="date" value={formPlan.reportDate} onChange={e => setFormPlan(f => ({ ...f, reportDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
              {errPlan && <p className="text-xs text-red-600">{errPlan}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setAvancePlanEdition(null)} className="px-3 py-2 text-sm text-gray-500">Annuler</button>
              <button
                onClick={() => mutModifierPlan.mutate()}
                disabled={(formPlan.planType === "partiel" && !formPlan.montantPartiel) || (formPlan.planType === "reporte" && !formPlan.reportDate) || mutModifierPlan.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#1a4731] rounded-lg disabled:opacity-50"
              >
                {mutModifierPlan.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal membre (avances) ────────────────────────────────────────── */}
      {modalMembre && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] sm:max-h-[85vh] flex flex-col">
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="font-bold text-gray-900">{modalMembre.prenoms} {modalMembre.nom}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {modalMembre.telephone}
                  {modalMembre.section && ` · ${modalMembre.section}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    setModalMembre(null);
                    setLocation(`/bons-reception-membres?membre_id=${modalMembre.id}`);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg px-2 py-1 transition-colors"
                >
                  <Package size={11} />
                  <span className="hidden sm:inline">Bon de réception</span>
                </button>
                <button
                  onClick={() => { setLocation(`/membres/${modalMembre.id}`); }}
                  className="text-xs text-[#1a4731] font-medium hover:underline"
                >
                  <span className="hidden sm:inline">Fiche complète</span>
                </button>
                <button
                  onClick={() => {
                    setModalMembre(null);
                    setShowOctroi(false);
                    setErrOctroi("");
                    setRembourserAvanceId(null);
                    setFormRembours({ montant: "", note: "" });
                    setErrRembours("");
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
              {!isMagasinier && (
              <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Avances</p>
                {peutOctroyer && !showOctroi && (
                  <button
                    onClick={() => setShowOctroi(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#1a4731] hover:underline"
                  >
                    <PlusCircle size={13} /> Octroyer
                  </button>
                )}
              </div>

              {showOctroi && (
                <div className="border border-[#1a4731]/20 rounded-xl p-4 space-y-3 bg-green-50/30">
                  <p className="text-xs font-semibold text-[#1a4731]">Nouvelle avance</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Montant (FCFA) *</label>
                      <MoneyInput
                        value={formOctroi.montant}
                        onChange={value => setFormOctroi(f => ({ ...f, montant: value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                        placeholder="50 000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Date d'octroi *</label>
                      <input
                        type="date"
                        value={formOctroi.dateOctroi}
                        onChange={e => setFormOctroi(f => ({ ...f, dateOctroi: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Échéance</label>
                    <input
                      type="date"
                      value={formOctroi.dateEcheance}
                      onChange={e => setFormOctroi(f => ({ ...f, dateEcheance: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Motif</label>
                    <input
                      type="text"
                      value={formOctroi.motif}
                      onChange={e => setFormOctroi(f => ({ ...f, motif: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                      placeholder="Achat d'intrants, frais de déplacement…"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Mode de décaissement *</label>
                    <select
                      value={formOctroi.modePaiement}
                      onChange={e => setFormOctroi(f => ({ ...f, modePaiement: e.target.value as typeof f.modePaiement }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                    >
                      <option value="especes">Espèces — caisse (571)</option>
                      <option value="mobile">Mobile Marchand (552)</option>
                      <option value="banque">Banque (521)</option>
                    </select>
                  </div>
                  {errOctroi && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={12} /> {errOctroi}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => mutOctroyer.mutate()}
                      disabled={!formOctroi.montant || mutOctroyer.isPending}
                      className="flex-1 bg-[#1a4731] text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50"
                    >
                      {mutOctroyer.isPending ? "Enregistrement…" : "Confirmer"}
                    </button>
                    <button
                      onClick={() => { setShowOctroi(false); setErrOctroi(""); }}
                      className="px-4 text-sm text-gray-500 hover:text-gray-700"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {loadAvances ? (
                <div className="text-sm text-center text-gray-400 py-4">Chargement…</div>
              ) : avancesModal.length === 0 ? (
                <div className="text-sm text-center text-gray-400 py-6">Aucune avance enregistrée</div>
              ) : (
                <div className="space-y-2">
                  {avancesModal.map(a => {
                    const enCours = a.statut !== "rembourse";
                    const isRembForm = rembourserAvanceId === a.id;
                    return (
                      <div
                        key={a.id}
                        className={`rounded-xl border p-3 ${
                          a.statut === "en_retard"
                            ? "border-red-200 bg-red-50"
                            : a.statut === "rembourse"
                            ? "border-gray-100 bg-gray-50"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{formaterMontant(a.montantOctroyeFcfa)}</p>
                            {a.motif && <p className="text-xs text-gray-500 mt-0.5">{a.motif}</p>}
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <CalendarDays size={10} /> {formaterDate(a.dateOctroi)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            {enCours && (
                              <p className="text-xs font-semibold text-gray-700">
                                Solde : {formaterMontant(a.soldeRestantFcfa)}
                              </p>
                            )}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              a.statut === "en_retard"
                                ? "bg-red-100 text-red-600"
                                : a.statut === "rembourse"
                                ? "bg-gray-100 text-gray-500"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {a.statut === "en_cours" ? "En cours" : a.statut === "rembourse" ? "Remboursé" : "En retard"}
                            </span>
                            {enCours && peutRembourser && !isRembForm && (
                              <button
                                onClick={() => {
                                  setRembourserAvanceId(a.id);
                                  setFormRembours({ montant: String(a.soldeRestantFcfa), note: "" });
                                  setErrRembours("");
                                }}
                                className="mt-1 flex items-center gap-1 text-xs text-[#1a4731] font-medium hover:underline ml-auto"
                              >
                                <ArrowDownCircle size={11} /> Rembourser
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Formulaire de remboursement inline */}
                        {isRembForm && (
                          <div className="mt-3 pt-3 border-t border-amber-200 space-y-2">
                            <p className="text-xs font-semibold text-gray-700">Remboursement manuel</p>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                              <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">
                                  Montant (FCFA) — solde : {formaterMontant(a.soldeRestantFcfa)}
                                </label>
                                <MoneyInput
                                  value={formRembours.montant}
                                  onChange={value => setFormRembours(f => ({ ...f, montant: value }))}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                                  placeholder="Montant"
                                  min="1"
                                  max={a.soldeRestantFcfa}
                                />
                              </div>
                              <button
                                onClick={() => mutRembourser.mutate(a.id)}
                                disabled={!formRembours.montant || mutRembourser.isPending}
                                className="bg-[#1a4731] text-white text-xs font-medium px-3 py-2 sm:py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap"
                              >
                                {mutRembourser.isPending ? "…" : "Confirmer"}
                              </button>
                              <button
                                onClick={() => { setRembourserAvanceId(null); setErrRembours(""); }}
                                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-2 sm:py-1.5"
                              >
                                Annuler
                              </button>
                            </div>
                            {errRembours && (
                              <p className="text-xs text-red-600 flex items-center gap-1">
                                <AlertCircle size={11} /> {errRembours}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </>
              )}

              {/* ── Livraisons du membre délégué ────────────────────────────── */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <ShoppingCart size={13} className="text-[#1a4731]" />
                  Livraisons
                </p>
                {loadLivraisons ? (
                  <p className="text-xs text-gray-400 py-3 text-center">Chargement…</p>
                ) : livraisonsModal.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">Aucune livraison enregistrée</p>
                ) : (
                  <div className="space-y-2">
                    {livraisonsModal.map(liv => {
                      const statutPaye = (liv.statutPaiement ?? "").toLowerCase().replace(/[_ ]/g, "") === "paye";
                      return (
                        <div key={liv.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">
                              {formaterMontant(liv.montantNetFcfa)}
                              <span className="text-xs font-normal text-gray-400 ml-1">net</span>
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formaterDate(liv.dateLivraison)} · {Number(liv.poidsKg).toFixed(1)} kg
                            </p>
                            {liv.avanceDeduiteFcfa > 0 && (
                              <p className="text-xs text-amber-600 mt-0.5">
                                Avance déduite : {formaterMontant(liv.avanceDeduiteFcfa)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {liv.statutPaiement && (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                statutPaye ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                              }`}>
                                {statutPaye ? "Payé" : "En attente"}
                              </span>
                            )}
                            <button
                              title="Télécharger le bordereau"
                              onClick={() => void downloadBordereau(liv.id)}
                              className="p-1.5 text-gray-400 hover:text-[#1a4731] transition-colors"
                            >
                              <Download size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal paiement commissions ────────────────────────────────────── */}
      {modalCommission && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] sm:max-h-[85vh] flex flex-col">
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="font-bold text-gray-900">
                  {modalCommission.prenoms} {modalCommission.nom}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Paiement des commissions en attente</p>
              </div>
              <button
                onClick={() => { setModalCommission(null); setDetailCommissions([]); setErrPayer(""); }}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
              {/* Résumé avec avances */}
              {(() => {
                const totalBrut = detailCommissions.reduce((s, c) => s + c.montantFcfa, 0);
                const totalAvances = avancesModalComm.reduce((s, a) => s + a.soldeRestantFcfa, 0);
                const retenue = Math.min(totalAvances, totalBrut);
                const montantNet = Math.max(0, totalBrut - retenue);
                return (
                  <div className="bg-[#1a4731]/5 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Commissions brutes</span>
                      <span className="font-medium text-gray-800">{formaterMontant(modalCommission.enAttenteFcfa)}</span>
                    </div>
                    {retenue > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-amber-600 flex items-center gap-1">
                          <AlertCircle size={12} /> Retenue avances
                        </span>
                        <span className="font-medium text-amber-700">− {formaterMontant(retenue)}</span>
                      </div>
                    )}
                    <div className="border-t border-[#1a4731]/20 pt-2 flex justify-between items-center">
                      <span className="text-xs text-gray-500 font-medium">Net à décaisser</span>
                      <span className="text-2xl font-bold text-[#1a4731]">{formaterMontant(montantNet)}</span>
                    </div>
                    <p className="text-xs text-gray-400">{detailCommissions.length} session(s) de pesée</p>
                  </div>
                );
              })()}

              {/* Détail des commissions */}
              {detailCommissions.length > 0 && (
                <div className="space-y-1.5">
                  {detailCommissions.map(c => (
                    <div key={c.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-gray-600 py-1.5 border-b border-gray-50">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={11} className="text-gray-300" />
                        {formaterDate(c.createdAt)} — {c.poidsKg} kg × {c.tauxFcfaParKg} F/kg
                      </span>
                      <span className="font-medium">{formaterMontant(c.montantFcfa)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Mode de paiement */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Mode de paiement *</label>
                  <select
                    value={formPayer.modePaiement}
                    onChange={e => setFormPayer(f => ({ ...f, modePaiement: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                  >
                    <option value="especes">Espèces</option>
                    <option value="orange_money">Orange Money</option>
                    <option value="mtn_momo">MTN MoMo</option>
                    <option value="wave">Wave</option>
                    <option value="virement">Virement</option>
                    <option value="cheque">Chèque</option>
                  </select>
                </div>
                {formPayer.modePaiement !== "especes" && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Référence / Numéro</label>
                    <input
                      type="text"
                      value={formPayer.referencePaiement}
                      onChange={e => setFormPayer(f => ({ ...f, referencePaiement: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4731]"
                      placeholder="Numéro de transaction"
                    />
                  </div>
                )}
              </div>

              {errPayer && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {errPayer}
                </p>
              )}

              {(() => {
                const totalBrut   = detailCommissions.reduce((s, c) => s + c.montantFcfa, 0);
                const totalAvances = avancesModalComm.reduce((s, a) => s + a.soldeRestantFcfa, 0);
                const retenue     = Math.min(totalAvances, totalBrut);
                const montantNet  = Math.max(0, totalBrut - retenue);
                return (
                  <button
                    onClick={() => mutPayer.mutate()}
                    disabled={mutPayer.isPending}
                    className="w-full bg-[#1a4731] text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
                  >
                    {mutPayer.isPending
                      ? "Paiement en cours…"
                      : `Confirmer le paiement — ${formaterMontant(montantNet)}`}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

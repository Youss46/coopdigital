import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import {
  Plus, Pencil, Trash2, CheckCircle2, Filter, BarChart3, WalletCards,
  TrendingDown, FileText, Loader2, Check, ChevronsUpDown,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "coop_token";

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { erreur?: string }).erreur ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Charge {
  id: number;
  date_charge: string;
  libelle: string;
  description: string | null;
  montant_fcfa: number;
  ppsi_taux_pct: number | null;
  retenue_ppsi_fcfa: number;
  montant_net_fcfa: number | null;
  categorie: string;
  compte_debit: string;
  compte_credit: string;
  compte_tresorerie_id: number | null;
  compte_tresorerie_type: "caisse" | "banque" | "mobile_marchand" | null;
  mode_paiement: string;
  tiers: string | null;
  reference_piece: string | null;
  statut: string;
  created_at: string;
  montant_regle_fcfa: number;
  date_reglement: string | null;
  compte_reglement_id: number | null;
  compte_reglement_type: "caisse" | "banque" | "mobile_marchand" | null;
  reference_reglement: string | null;
}

interface Stats {
  total_fcfa: number;
  nb_charges: number;
  par_categorie: Array<{ categorie: string; total: number; nb: number }>;
}

interface CaisseTresorerie {
  id: number;
  nom: string;
  solde_actuel_fcfa?: string | number;
}

interface BanqueTresorerie {
  id: number;
  nom: string;
  banque: string;
}

interface MobileTresorerie {
  id: number;
  nom: string;
  operateur: string;
}

interface CompteCharge {
  id: number;
  numeroCompte: string;
  libelle: string;
  classe: number | null;
  ordreAffichage: number | null;
}

// ── Référentiels ──────────────────────────────────────────────────────────────
const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "loyer",           label: "Loyer et charges locatives" },
  { value: "eau_electricite", label: "Eau et électricité" },
  { value: "fournitures",     label: "Fournitures de bureau" },
  { value: "communication",   label: "Téléphone et communication" },
  { value: "deplacement",     label: "Déplacements et transport" },
  { value: "reception",       label: "Réceptions et hébergement" },
  { value: "entretien",       label: "Entretien et réparations" },
  { value: "honoraires",      label: "Honoraires et consultants" },
  { value: "ppsi",            label: "Prestation informelle — PPSSI" },
  { value: "publicite",       label: "Publicité et marketing" },
  { value: "autre",           label: "Autres charges" },
];

const MODES_PAIEMENT = [
  { value: "especes",       label: "Espèces" },
  { value: "cheque",        label: "Chèque" },
  { value: "virement",      label: "Virement bancaire" },
  { value: "mobile_money",  label: "Mobile Money" },
  { value: "credit",        label: "À crédit" },
];

const EMPTY_FORM = {
  date_charge:     new Date().toISOString().split("T")[0]!,
  libelle:         "",
  description:     "",
  montant_fcfa:    "",
  categorie:       "autre",
  compte_debit:    "658000",
  compte_credit:   "",
  compte_tresorerie_id: "",
  compte_tresorerie_type: "",
  mode_paiement:   "especes",
  tiers:           "",
  reference_piece: "",
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtFcfa(n: number) {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

const STATUT_BADGE: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  valide:    "bg-green-100 text-green-800",
  reglee:    "bg-blue-100 text-blue-800",
};

// ── Composant principal ───────────────────────────────────────────────────────
export default function ChargesDiversesPage() {
  const { toast } = useToast();
  const { isFeatureReadOnly } = useFeatureAccess("charges_diverses");
  const qc = useQueryClient();

  // Filtres
  const [filtreStatut,    setFiltreStatut]    = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState("");
  const [filtreDebut,     setFiltreDebut]     = useState("");
  const [filtreFin,       setFiltreFin]       = useState("");

  // Modale
  const [showForm,     setShowForm]     = useState(false);
  const [editTarget,   setEditTarget]   = useState<Charge | null>(null);
  const [form,         setForm]         = useState({ ...EMPTY_FORM });
  const [showStats,    setShowStats]    = useState(false);
  const [reglementTarget, setReglementTarget] = useState<Charge | null>(null);
  const [reglementForm, setReglementForm] = useState({
    date_reglement: new Date().toISOString().split("T")[0]!,
    compte_tresorerie_id: "",
    compte_tresorerie_type: "" as "" | "caisse" | "banque" | "mobile_marchand",
    reference: "",
  });

  const [categorieOpen, setCategorieOpen] = useState(false);
  const [compteChargeOpen, setCompteChargeOpen] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const qs = new URLSearchParams();
  if (filtreStatut)    qs.set("statut",    filtreStatut);
  if (filtreCategorie) qs.set("categorie", filtreCategorie);
  if (filtreDebut)     qs.set("date_debut", filtreDebut);
  if (filtreFin)       qs.set("date_fin",   filtreFin);

  const { data: charges = [], isLoading } = useQuery<Charge[]>({
    queryKey: ["charges-diverses", filtreStatut, filtreCategorie, filtreDebut, filtreFin],
    queryFn:  () => apiFetch<Charge[]>(`/charges-diverses?${qs}`),
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["charges-diverses-stats", filtreDebut, filtreFin],
    queryFn:  () => apiFetch<Stats>(`/charges-diverses/stats${filtreDebut || filtreFin ? `?date_debut=${filtreDebut}&date_fin=${filtreFin}` : ""}`),
    enabled:  showStats,
  });

  const { data: caisses = [] } = useQuery<CaisseTresorerie[]>({
    queryKey: ["charges-diverses-comptes", "caisse"],
    queryFn:  () => apiFetch<CaisseTresorerie[]>("/caisse"),
  });

  const { data: banques = [] } = useQuery<BanqueTresorerie[]>({
    queryKey: ["charges-diverses-comptes", "banque"],
    queryFn:  () => apiFetch<BanqueTresorerie[]>("/banque"),
  });

  const { data: mobiles = [] } = useQuery<MobileTresorerie[]>({
    queryKey: ["charges-diverses-comptes", "mobile_marchand"],
    queryFn:  () => apiFetch<MobileTresorerie[]>("/mobile-marchand"),
  });

  const { data: dettes = [] } = useQuery<Charge[]>({
    queryKey: ["charges-diverses-dettes-fournisseurs"],
    queryFn: () => apiFetch<Charge[]>("/charges-diverses/dettes-fournisseurs"),
  });

  const { data: comptesCharge = [], isLoading: comptesChargeLoading, isError: comptesChargeError } = useQuery<CompteCharge[]>({
    queryKey: ["charges-diverses-comptes-charge"],
    queryFn: () => apiFetch<CompteCharge[]>("/charges-diverses/comptes-charge"),
    staleTime: 5 * 60 * 1000,
  });

  const catLabel = (v: string, comptes = comptesCharge) =>
    comptes.find(c => c.numeroCompte === v)?.libelle
      ? `${v} — ${comptes.find(c => c.numeroCompte === v)?.libelle}`
      : CATEGORIES.find(c => c.value === v)?.label ?? v;
  const compteChargeSelection = comptesCharge.find(c => c.numeroCompte === form.compte_debit);
  const compteChargeLabel = compteChargeSelection
    ? `${compteChargeSelection.numeroCompte} — ${compteChargeSelection.libelle}`
    : form.compte_debit
      ? `${form.compte_debit} — compte actuel`
      : "Sélectionner un compte de charge";
  const compteChargeOptions = comptesCharge.map(compte => ({
    value: compte.numeroCompte,
    label: `${compte.numeroCompte} — ${compte.libelle}`,
  }));
  const categorieActuelleStatique = CATEGORIES.find(c => c.value === form.categorie);
  const categorieOptions = [
    { value: "ppsi", label: "Prestation informelle — PPSSI" },
    ...compteChargeOptions,
    ...(categorieActuelleStatique && form.categorie !== "ppsi" && !compteChargeOptions.some(c => c.value === form.categorie)
      ? [categorieActuelleStatique]
      : []),
  ];
  const categorieLabel = categorieOptions.find(c => c.value === form.categorie)?.label
    ?? catLabel(form.categorie);
  const filtreCategorieOptions = [
    ...CATEGORIES,
    ...compteChargeOptions.filter(compte => !CATEGORIES.some(categorie => categorie.value === compte.value)),
  ];

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["charges-diverses"] }); };

  const createMut = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) =>
      apiFetch("/charges-diverses", { method: "POST", body: JSON.stringify({
        date_charge:     data.date_charge,
        libelle:         data.libelle,
        description:     data.description || null,
        montant_fcfa:    parseFloat(data.montant_fcfa),
        categorie:       data.categorie,
        compte_debit:    data.compte_debit,
        compte_credit:   data.compte_credit,
        compte_tresorerie_id: data.compte_tresorerie_id ? Number(data.compte_tresorerie_id) : null,
        compte_tresorerie_type: data.compte_tresorerie_type || null,
        mode_paiement:   data.mode_paiement,
        tiers:           data.tiers || null,
        reference_piece: data.reference_piece || null,
      }) }),
    onSuccess: () => { toast({ title: "Charge enregistrée" }); setShowForm(false); invalidate(); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: typeof EMPTY_FORM & { id: number }) =>
      apiFetch(`/charges-diverses/${data.id}`, { method: "PUT", body: JSON.stringify({
        date_charge:     data.date_charge,
        libelle:         data.libelle,
        description:     data.description || null,
        montant_fcfa:    parseFloat(data.montant_fcfa),
        categorie:       data.categorie,
        compte_debit:    data.compte_debit,
        compte_credit:   data.compte_credit,
        compte_tresorerie_id: data.compte_tresorerie_id ? Number(data.compte_tresorerie_id) : null,
        compte_tresorerie_type: data.compte_tresorerie_type || null,
        mode_paiement:   data.mode_paiement,
        tiers:           data.tiers || null,
        reference_piece: data.reference_piece || null,
      }) }),
    onSuccess: () => { toast({ title: "Charge mise à jour" }); setShowForm(false); invalidate(); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const validerMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/charges-diverses/${id}/valider`, { method: "PUT" }),
    onSuccess: () => { toast({ title: "Charge validée ✓", description: "L'écriture comptable a été générée." }); invalidate(); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/charges-diverses/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Charge supprimée" }); invalidate(); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const reglerMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number; date_reglement: string; compte_tresorerie_id: number; compte_tresorerie_type: "caisse" | "banque" | "mobile_marchand"; reference?: string }) =>
      apiFetch(`/charges-diverses/${id}/regler`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Dette fournisseur réglée", description: "Le compte 401 et la trésorerie ont été mis à jour." });
      setReglementTarget(null);
      void qc.invalidateQueries({ queryKey: ["charges-diverses"] });
      void qc.invalidateQueries({ queryKey: ["charges-diverses-dettes-fournisseurs"] });
    },
    onError: (e: Error) => toast({ title: "Règlement impossible", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setEditTarget(null);
    const compteParDefaut = comptesCharge[0]?.numeroCompte ?? EMPTY_FORM.compte_debit;
    setForm({
      ...EMPTY_FORM,
      categorie: comptesCharge[0]?.numeroCompte ?? EMPTY_FORM.categorie,
      compte_debit: compteParDefaut,
    });
    setShowForm(true);
  }, [comptesCharge]);

  const openReglement = useCallback((charge: Charge) => {
    setReglementTarget(charge);
    setReglementForm({
      date_reglement: new Date().toISOString().split("T")[0]!,
      compte_tresorerie_id: "",
      compte_tresorerie_type: "",
      reference: charge.reference_piece ? `REG-${charge.reference_piece}` : "",
    });
  }, []);

  const selectReglementTresorerie = useCallback((value: string) => {
    const [type, id] = value.split(":");
    if (!id || !["caisse", "banque", "mobile_marchand"].includes(type ?? "")) return;
    setReglementForm(f => ({
      ...f,
      compte_tresorerie_id: id,
      compte_tresorerie_type: type as "caisse" | "banque" | "mobile_marchand",
    }));
  }, []);

  const submitReglement = useCallback(() => {
    if (!reglementTarget || !reglementForm.date_reglement || !reglementForm.compte_tresorerie_id || !reglementForm.compte_tresorerie_type) {
      toast({ title: "Compte de trésorerie requis", description: "Sélectionnez le compte qui sera débité.", variant: "destructive" });
      return;
    }
    reglerMut.mutate({
      id: reglementTarget.id,
      date_reglement: reglementForm.date_reglement,
      compte_tresorerie_id: Number(reglementForm.compte_tresorerie_id),
      compte_tresorerie_type: reglementForm.compte_tresorerie_type,
      reference: reglementForm.reference || undefined,
    });
  }, [reglementTarget, reglementForm, reglerMut, toast]);

  const openEdit = useCallback((c: Charge) => {
    setEditTarget(c);
    setForm({
      date_charge:     c.date_charge,
      libelle:         c.libelle,
      description:     c.description ?? "",
      montant_fcfa:    String(c.montant_fcfa),
      categorie:       c.categorie,
      compte_debit:    c.compte_debit,
      compte_credit:   c.compte_credit,
      compte_tresorerie_id: c.compte_tresorerie_id ? String(c.compte_tresorerie_id) : "",
      compte_tresorerie_type: c.compte_tresorerie_type ?? "",
      mode_paiement:   c.compte_credit === "401000" ? "credit" : c.mode_paiement,
      tiers:           c.tiers ?? "",
      reference_piece: c.reference_piece ?? "",
    });
    setShowForm(true);
  }, []);

  const handleSubmit = useCallback(() => {
    if (isFeatureReadOnly) return;
    if (!form.libelle || !form.montant_fcfa || !form.date_charge) {
      toast({ title: "Champs requis", description: "Libellé, montant et date sont obligatoires.", variant: "destructive" });
      return;
    }
    if (!form.compte_debit) {
      toast({ title: "Compte de charge requis", description: "Sélectionnez un compte de charge SYSCOHADA actif.", variant: "destructive" });
      return;
    }
    if (!form.compte_credit) {
      toast({ title: "Compte requis", description: "Sélectionnez le compte crédit de la charge.", variant: "destructive" });
      return;
    }
    if (form.mode_paiement === "credit" && form.compte_credit !== "401000") {
      toast({ title: "Compte fournisseur requis", description: "Une charge à crédit doit utiliser le compte 401 — Fournisseurs.", variant: "destructive" });
      return;
    }
    if (form.mode_paiement === "credit" && !form.tiers.trim()) {
      toast({ title: "Fournisseur requis", description: "Indiquez le fournisseur ou le tiers pour une charge à crédit.", variant: "destructive" });
      return;
    }
    if (form.mode_paiement !== "credit" && form.compte_credit === "401000") {
      toast({ title: "Mode de paiement invalide", description: "Le compte 401 — Fournisseurs nécessite le mode de paiement « À crédit ».", variant: "destructive" });
      return;
    }
    if (form.compte_credit !== "401000" && (!form.compte_tresorerie_type || !form.compte_tresorerie_id)) {
      toast({ title: "Compte de trésorerie requis", description: "Sélectionnez le compte de trésorerie qui sera débité à la validation.", variant: "destructive" });
      return;
    }
    if (editTarget) {
      updateMut.mutate({ ...form, id: editTarget.id });
    } else {
      createMut.mutate(form);
    }
  }, [form, editTarget, createMut, updateMut, toast, isFeatureReadOnly]);

  const handleCompteCreditChange = useCallback((value: string) => {
    if (value === "401000") {
      setForm(f => ({
        ...f,
        compte_credit: "401000",
        compte_tresorerie_id: "",
        compte_tresorerie_type: "",
        mode_paiement: "credit",
      }));
      return;
    }
    const [type, id] = value.split(":");
    if (!id || !["caisse", "banque", "mobile_marchand"].includes(type ?? "")) return;
    const compteCredit = type === "caisse" ? "571000" : type === "banque" ? "521000" : "552000";
    const modePaiement = type === "caisse" ? "especes" : type === "banque" ? "virement" : "mobile_money";
    setForm(f => ({
      ...f,
      compte_credit: compteCredit,
      compte_tresorerie_id: id,
      compte_tresorerie_type: type,
      mode_paiement: modePaiement,
    }));
  }, []);

  const handleCategorieChange = useCallback((value: string) => {
    if (value === "ppsi") {
      const comptePpsi = comptesCharge.find(compte => compte.numeroCompte === "632000")?.numeroCompte
        ?? comptesCharge[0]?.numeroCompte;
      setForm(f => ({
        ...f,
        categorie: value,
        compte_debit: comptePpsi ?? f.compte_debit,
      }));
      setCategorieOpen(false);
      return;
    }
    setForm(f => ({ ...f, categorie: value, compte_debit: value }));
    setCategorieOpen(false);
  }, [comptesCharge]);

  const handleCompteChargeChange = useCallback((numeroCompte: string) => {
    setForm(f => ({
      ...f,
      compte_debit: numeroCompte,
      categorie: f.categorie === "ppsi" ? "ppsi" : numeroCompte,
    }));
    setCompteChargeOpen(false);
  }, []);

  const handleModePaiementChange = useCallback((modePaiement: string) => {
    if (modePaiement === "credit") {
      setForm(f => ({
        ...f,
        mode_paiement: "credit",
        compte_credit: "401000",
        compte_tresorerie_id: "",
        compte_tresorerie_type: "",
      }));
      return;
    }
    const typeAttendu = modePaiement === "especes"
      ? "caisse"
      : modePaiement === "virement"
        ? "banque"
        : modePaiement === "mobile_money"
          ? "mobile_marchand"
          : null;
    setForm(f => ({
      ...f,
      mode_paiement: modePaiement,
      ...(f.compte_credit === "401000" || (typeAttendu && f.compte_tresorerie_type !== typeAttendu)
        ? { compte_credit: "", compte_tresorerie_id: "", compte_tresorerie_type: "" }
        : {}),
    }));
  }, []);

  const afficherCaisses = form.mode_paiement === "especes" || form.mode_paiement === "cheque";
  const afficherBanques = form.mode_paiement === "virement" || form.mode_paiement === "cheque";
  const afficherMobiles = form.mode_paiement === "mobile_money" || form.mode_paiement === "cheque";

  const compteCreditValue = form.compte_tresorerie_type && form.compte_tresorerie_id
    ? `${form.compte_tresorerie_type}:${form.compte_tresorerie_id}`
    : form.compte_credit;
  const statutLabel = (statut: string) =>
    statut === "reglee" ? "✓ Réglée" : statut === "valide" ? "✓ Validé" : "Brouillon";
  const isSubmitting = createMut.isPending || updateMut.isPending;
  const renderChargeActions = (charge: Charge) => (
    <>
      {charge.statut === "valide" && charge.mode_paiement === "credit" && !isFeatureReadOnly && (
        <Button
          variant="ghost"
          size="icon"
          title="Régler la dette fournisseur"
          aria-label="Régler la dette fournisseur"
          onClick={() => openReglement(charge)}
          disabled={reglerMut.isPending || charge.montant_regle_fcfa > 0}
        >
          <WalletCards className="h-4 w-4 text-blue-600" />
        </Button>
      )}
      {charge.statut === "brouillon" && (
        <>
          {!isFeatureReadOnly && (
            <Button
              variant="ghost"
              size="icon"
              title="Valider et générer l'écriture comptable"
              aria-label="Valider et générer l'écriture comptable"
              onClick={() => validerMut.mutate(charge.id)}
              disabled={validerMut.isPending}
            >
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </Button>
          )}
          {!isFeatureReadOnly && (
            <Button
              variant="ghost"
              size="icon"
              title="Modifier la charge"
              aria-label="Modifier la charge"
              onClick={() => openEdit(charge)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {!isFeatureReadOnly && (
            <Button
              variant="ghost"
              size="icon"
              title="Supprimer la charge"
              aria-label="Supprimer la charge"
              onClick={() => { if (confirm("Supprimer cette charge ?")) deleteMut.mutate(charge.id); }}
              disabled={deleteMut.isPending}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </>
      )}
    </>
  );

  // ── Rendu ─────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingDown className="h-6 w-6 text-red-500" />
            Charges diverses
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Enregistrement et suivi des dépenses de fonctionnement de la coopérative
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:shrink-0">
          <Button className="w-full" variant="outline" onClick={() => setShowStats(s => !s)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            {showStats ? "Masquer stats" : "Statistiques"}
          </Button>
          {!isFeatureReadOnly && <Button onClick={openCreate} className="w-full bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4 mr-2" /> Nouvelle charge
          </Button>}
        </div>
      </div>

      {/* Stats */}
      {showStats && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500">Total validé</p>
              <p className="text-xl font-bold text-red-600">{fmtFcfa(stats.total_fcfa)}</p>
              <p className="text-xs text-gray-400">{stats.nb_charges} charge{stats.nb_charges > 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          {stats.par_categorie.slice(0, 3).map(r => (
            <Card key={r.categorie}>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500 truncate">{catLabel(r.categorie)}</p>
                <p className="text-lg font-bold text-gray-800">{fmtFcfa(r.total)}</p>
                <p className="text-xs text-gray-400">{r.nb} charge{r.nb > 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dettes.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <WalletCards className="h-4 w-4 text-amber-700" />
              Dettes fournisseurs à régler
              <Badge variant="secondary" className="ml-auto">{dettes.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dettes.map(dette => (
              <div key={dette.id} className="flex flex-col gap-2 rounded-md border bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{dette.tiers || "Fournisseur non nommé"} — {dette.libelle}</p>
                  <p className="text-xs text-gray-500">{fmt(dette.date_charge)} · {fmtFcfa(dette.montant_fcfa)}</p>
                </div>
                {!isFeatureReadOnly && (
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => openReglement(dette)}>
                    <WalletCards className="h-4 w-4 mr-1" /> Régler
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-gray-500">Statut</Label>
              <Select value={filtreStatut || "all"} onValueChange={v => setFiltreStatut(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Tous" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="brouillon">Brouillon</SelectItem>
                  <SelectItem value="valide">Validé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Catégorie</Label>
              <Select value={filtreCategorie || "all"} onValueChange={v => setFiltreCategorie(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Toutes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Du</Label>
              <Input type="date" value={filtreDebut} onChange={e => setFiltreDebut(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Au</Label>
              <Input type="date" value={filtreFin} onChange={e => setFiltreFin(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Charges enregistrées
            {charges.length > 0 && (
              <Badge variant="secondary" className="ml-auto">{charges.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : charges.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <TrendingDown className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p>Aucune charge enregistrée</p>
              {!isFeatureReadOnly && <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Ajouter une charge
              </Button>}
            </div>
          ) : (
            <>
            <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Tiers / Fournisseur</TableHead>
                   <TableHead className="text-right">Montant brut</TableHead>
                   <TableHead className="text-right">Net prestataire</TableHead>
                  <TableHead>Compte (D/C)</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm text-gray-600 whitespace-nowrap">{fmt(c.date_charge)}</TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{c.libelle}</p>
                      {c.description && <p className="text-xs text-gray-400 truncate max-w-[200px]">{c.description}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{catLabel(c.categorie)}</TableCell>
                    <TableCell className="text-sm text-gray-600">{c.tiers ?? "—"}</TableCell>
                     <TableCell className="text-right font-semibold text-sm">
                      {fmtFcfa(c.montant_fcfa)}
                    </TableCell>
                     <TableCell className="text-right text-sm">
                       {c.categorie === "ppsi" ? (
                         <div>
                           <span className="font-semibold">{fmtFcfa(c.montant_net_fcfa ?? c.montant_fcfa - c.retenue_ppsi_fcfa)}</span>
                           <p className="text-xs text-amber-700">Retenue {fmtFcfa(c.retenue_ppsi_fcfa)}</p>
                         </div>
                       ) : "—"}
                     </TableCell>
                    <TableCell className="text-xs text-gray-500 font-mono">{c.compte_debit} / {c.compte_credit}</TableCell>
                    <TableCell>
                      <Badge className={STATUT_BADGE[c.statut] ?? "bg-gray-100 text-gray-600"}>
                        {c.statut === "reglee" ? "✓ Réglée" : c.statut === "valide" ? "✓ Validé" : "Brouillon"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {renderChargeActions(c)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            <div className="md:hidden divide-y divide-gray-100">
              {charges.map(c => (
                <div key={c.id} className="space-y-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 break-words">{c.libelle}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {fmt(c.date_charge)} · {catLabel(c.categorie)}
                      </p>
                    </div>
                    <Badge className={`shrink-0 ${STATUT_BADGE[c.statut] ?? "bg-gray-100 text-gray-600"}`}>
                      {statutLabel(c.statut)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Montant brut</p>
                      <p className="font-semibold">{fmtFcfa(c.montant_fcfa)}</p>
                    </div>
                    {c.categorie === "ppsi" && (
                      <div>
                        <p className="text-xs text-gray-500">Net prestataire</p>
                        <p className="font-semibold">
                          {fmtFcfa(c.montant_net_fcfa ?? c.montant_fcfa - c.retenue_ppsi_fcfa)}
                        </p>
                      </div>
                    )}
                    {c.tiers && (
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500">Tiers / Fournisseur</p>
                        <p className="truncate">{c.tiers}</p>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">Compte</p>
                      <p className="truncate font-mono text-xs text-gray-600">{c.compte_debit} / {c.compte_credit}</p>
                    </div>
                  </div>
                  {c.description && <p className="text-xs text-gray-500 break-words">{c.description}</p>}
                  <div className="flex justify-end gap-1 border-t border-gray-100 pt-2">
                    {renderChargeActions(c)}
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reglementTarget} onOpenChange={open => !open && setReglementTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Régler la dette fournisseur</DialogTitle>
          </DialogHeader>
          {reglementTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-gray-50 p-3 text-sm">
                <p className="font-medium">{reglementTarget.tiers || "Fournisseur non nommé"}</p>
                <p className="text-gray-600">{reglementTarget.libelle}</p>
                <p className="mt-1 font-semibold text-blue-700">
                  {fmtFcfa(reglementTarget.montant_fcfa - reglementTarget.montant_regle_fcfa)} à régler
                </p>
              </div>
              <div className="space-y-1">
                <Label>Date de règlement *</Label>
                <Input
                  type="date"
                  value={reglementForm.date_reglement}
                  onChange={e => setReglementForm(f => ({ ...f, date_reglement: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Compte débité *</Label>
                <Select
                  value={reglementForm.compte_tresorerie_type && reglementForm.compte_tresorerie_id
                    ? `${reglementForm.compte_tresorerie_type}:${reglementForm.compte_tresorerie_id}` : ""}
                  onValueChange={selectReglementTresorerie}
                >
                  <SelectTrigger><SelectValue placeholder="Sélectionner une caisse, banque ou Mobile Money" /></SelectTrigger>
                  <SelectContent>
                    {caisses.map(c => <SelectItem key={`caisse:${c.id}`} value={`caisse:${c.id}`}>Caisse — {c.nom}</SelectItem>)}
                    {banques.map(c => <SelectItem key={`banque:${c.id}`} value={`banque:${c.id}`}>Banque — {c.nom}{c.banque ? ` (${c.banque})` : ""}</SelectItem>)}
                    {mobiles.map(c => <SelectItem key={`mobile_marchand:${c.id}`} value={`mobile_marchand:${c.id}`}>Mobile Money — {c.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Référence du règlement</Label>
                <Input
                  placeholder="N° de reçu, virement…"
                  value={reglementForm.reference}
                  onChange={e => setReglementForm(f => ({ ...f, reference: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReglementTarget(null)}>Annuler</Button>
            <Button onClick={submitReglement} disabled={reglerMut.isPending}>
              {reglerMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Régler {reglementTarget ? fmtFcfa(reglementTarget.montant_fcfa - reglementTarget.montant_regle_fcfa) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale création/édition */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Modifier la charge" : "Nouvelle charge diverse"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={form.date_charge} onChange={e => setForm(f => ({ ...f, date_charge: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Montant (FCFA) *</Label>
                <NumericInput decimal={false} min="0" step="1" placeholder="Ex: 50000" value={form.montant_fcfa} onChange={v => setForm(f => ({ ...f, montant_fcfa: v }))} />
                {form.categorie === "ppsi" && parseFloat(form.montant_fcfa) > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    Retenue PPSSI estimée (2 %) : {fmtFcfa(parseFloat(form.montant_fcfa) * 0.02)} · Net prestataire : {fmtFcfa(parseFloat(form.montant_fcfa) * 0.98)}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Libellé *</Label>
              <Input placeholder="Description courte de la dépense" value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Description (facultatif)</Label>
              <Textarea placeholder="Détails, contexte…" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Catégorie *</Label>
                <Select value={form.categorie} onValueChange={v => setForm(f => ({ ...f, categorie: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Mode de paiement</Label>
                <Select value={form.mode_paiement} onValueChange={handleModePaiementChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODES_PAIEMENT.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Compte de charge SYSCOHADA *</Label>
                <Popover open={compteChargeOpen} onOpenChange={setCompteChargeOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      disabled={comptesChargeLoading || comptesChargeError || comptesCharge.length === 0}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate text-left">
                        {comptesChargeLoading ? "Chargement du plan…" : comptesChargeError ? "Plan comptable indisponible" : compteChargeLabel}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Rechercher un compte ou un libellé…" />
                      <CommandList>
                        <CommandEmpty>Aucun compte de charge trouvé.</CommandEmpty>
                        {comptesCharge.map(compte => (
                          <CommandItem
                            key={compte.id}
                            value={`${compte.numeroCompte} ${compte.libelle}`}
                            onSelect={() => {
                              setForm(f => ({ ...f, compte_debit: compte.numeroCompte }));
                              setCompteChargeOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${form.compte_debit === compte.numeroCompte ? "opacity-100" : "opacity-0"}`} />
                            <span className="font-mono">{compte.numeroCompte}</span>
                            <span className="ml-2 truncate">{compte.libelle}</span>
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-gray-400">
                  {comptesChargeError
                    ? "Impossible de charger le plan comptable."
                    : comptesCharge.length === 0 && !comptesChargeLoading
                      ? "Aucun compte de charge actif dans le plan comptable."
                      : "Les comptes actifs de type charge sont proposés."}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Compte crédit / trésorerie *</Label>
                <Select value={compteCreditValue} onValueChange={handleCompteCreditChange}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un compte" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="401000">401000 — Fournisseurs (à crédit, sans sortie immédiate)</SelectItem>
                    {form.compte_credit === "571000" && !form.compte_tresorerie_id && (
                      <SelectItem value="571000" disabled>571000 — Caisse (compte historique à remplacer)</SelectItem>
                    )}
                    {form.compte_credit === "521000" && !form.compte_tresorerie_id && (
                      <SelectItem value="521000" disabled>521000 — Banque (compte historique à remplacer)</SelectItem>
                    )}
                    {form.compte_credit === "552000" && !form.compte_tresorerie_id && (
                      <SelectItem value="552000" disabled>552000 — Mobile Marchand (compte historique à remplacer)</SelectItem>
                    )}
                    {afficherCaisses && caisses.map(c => (
                      <SelectItem key={`caisse:${c.id}`} value={`caisse:${c.id}`}>
                        571 — Caisse : {c.nom}
                      </SelectItem>
                    ))}
                    {afficherBanques && banques.map(c => (
                      <SelectItem key={`banque:${c.id}`} value={`banque:${c.id}`}>
                        521 — Banque : {c.nom}{c.banque ? ` (${c.banque})` : ""}
                      </SelectItem>
                    ))}
                    {afficherMobiles && mobiles.map(c => (
                      <SelectItem key={`mobile_marchand:${c.id}`} value={`mobile_marchand:${c.id}`}>
                        552 — Mobile Marchand : {c.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">
                  {form.mode_paiement === "credit"
                    ? "La validation créera une dette fournisseur, sans sortie de trésorerie immédiate."
                    : "La validation créera automatiquement une sortie sur le compte sélectionné."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tiers / Fournisseur{form.categorie === "ppsi" ? " *" : ""}</Label>
                <Input placeholder="Nom du prestataire" value={form.tiers} onChange={e => setForm(f => ({ ...f, tiers: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>N° pièce / référence</Label>
                <Input placeholder="Facture, reçu…" value={form.reference_piece} onChange={e => setForm(f => ({ ...f, reference_piece: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editTarget ? "Mettre à jour" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

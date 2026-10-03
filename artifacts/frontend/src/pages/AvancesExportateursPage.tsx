import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetAvancesExportateursQueryKey,
  getGetAvanceExportateurQueryKey,
  getGetVentesEligiblesAvanceExportateurQueryKey,
  getGetExportateursQueryKey,
  useGetAvancesExportateurs,
  useGetAvanceExportateur,
  useGetVentesEligiblesAvanceExportateur,
  useGetExportateurs,
  useCreerAvanceExportateur,
  useDeposerAvanceExportateur,
  useEncaisserAvanceExportateur,
  useRejeterAvanceExportateur,
  useAnnulerAvanceExportateur,
  useImputerAvanceExportateur,
  type AvanceExportateur,
  type AvanceExportateurStatut,
  type ExportateurDetail,
} from "@workspace/api-client-react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  History,
  Landmark,
  LoaderCircle,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import { MoneyInput } from "@/components/ui/money-input";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const today = () => new Date().toISOString().slice(0, 10);
interface CompteBancaire {
  id: number;
  nom: string;
  banque: string;
  numero_compte?: string | null;
  solde_actuel_fcfa: string;
}

function fmtMoney(amount: number) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}
function fmtDate(date?: string | null) {
  if (!date) return "—";
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur est survenue. Réessayez.";
}

const STATUS: Record<AvanceExportateurStatut, { label: string; tone: string; icon: typeof Clock3 }> = {
  a_deposer: { label: "À déposer", tone: "awaiting", icon: Clock3 },
  depose: { label: "Déposé", tone: "deposited", icon: ArrowDownToLine },
  encaisse: { label: "Encaissé", tone: "cleared", icon: CheckCircle2 },
  rejete: { label: "Rejeté", tone: "rejected", icon: XCircle },
  annule: { label: "Annulé", tone: "cancelled", icon: XCircle },
};

type DialogState =
  | { type: "deposer"; avance: AvanceExportateur }
  | { type: "encaisser"; avance: AvanceExportateur }
  | { type: "rejeter"; avance: AvanceExportateur }
  | { type: "annuler"; avance: AvanceExportateur }
  | { type: "imputer"; avance: AvanceExportateur }
  | { type: "creer" }
  | null;

const blankCreate = {
  exportateurId: "",
  numeroCheque: "",
  banque: "",
  montantFcfa: "",
  dateReception: today(),
  dateEcheance: "",
};

export default function AvancesExportateursPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isFeatureReadOnly } = useFeatureAccess("cheques");
  const peutLire = usePermission("cheques", "lire");
  const peutCreer = usePermission("cheques", "creer") && !isFeatureReadOnly;
  const peutDeposer = usePermission("cheques", "modifier") && !isFeatureReadOnly;
  const peutEncaisser = usePermission("cheques", "encaisser") && !isFeatureReadOnly;
  const peutRejeter = usePermission("cheques", "rejeter") && !isFeatureReadOnly;
  const peutAnnuler = usePermission("cheques", "annuler") && !isFeatureReadOnly;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [filtre, setFiltre] = useState<"tous" | AvanceExportateurStatut>("tous");
  const [recherche, setRecherche] = useState("");
  const [form, setForm] = useState(blankCreate);
  const [dateAction, setDateAction] = useState(today());
  const [compteId, setCompteId] = useState("");
  const [motif, setMotif] = useState("");
  const [venteId, setVenteId] = useState("");
  const [montantImputation, setMontantImputation] = useState("");

  const avancesQuery = useGetAvancesExportateurs({
    query: { queryKey: getGetAvancesExportateursQueryKey(), refetchOnMount: "always", enabled: peutLire },
  });
  const avances = avancesQuery.data ?? [];
  const { data: detail, isLoading: detailLoading, isError: detailError, refetch: refetchDetail } =
    useGetAvanceExportateur(selectedId ?? 0, {
      query: { enabled: peutLire && selectedId !== null, queryKey: getGetAvanceExportateurQueryKey(selectedId ?? 0) },
    });
  const { data: ventesEligibles = [], isLoading: ventesLoading, isError: ventesError } =
    useGetVentesEligiblesAvanceExportateur(selectedId ?? 0, {
      query: { enabled: peutLire && selectedId !== null, queryKey: getGetVentesEligiblesAvanceExportateurQueryKey(selectedId ?? 0) },
    });
  const { data: exportateurs = [], isLoading: exportateursLoading, isError: exportateursError, refetch: refetchExportateurs } = useGetExportateurs({
    query: { queryKey: getGetExportateursQueryKey(), enabled: peutCreer && dialog?.type === "creer" },
  });
  const { data: comptes = [], isLoading: comptesLoading, isError: comptesError, refetch: refetchComptes } =
    useQuery<CompteBancaire[]>({
      queryKey: ["banque-comptes"],
      queryFn: async () => {
        const token = localStorage.getItem("coop_token") ?? "";
        const response = await fetch(`${API_BASE}/api/banque`, {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Impossible de charger les comptes bancaires.");
        return response.json() as Promise<CompteBancaire[]>;
      },
        enabled: peutEncaisser && dialog?.type === "encaisser",
    });

  const invalidateCurrent = (id?: number) => {
    void queryClient.invalidateQueries({ queryKey: getGetAvancesExportateursQueryKey() });
    void queryClient.invalidateQueries({ queryKey: ["banque-comptes"] });
    if (id !== undefined) {
      void queryClient.invalidateQueries({ queryKey: getGetAvanceExportateurQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: getGetVentesEligiblesAvanceExportateurQueryKey(id) });
    }
  };
  const onMutationError = (error: unknown) => toast({
    title: "Action impossible",
    description: errorText(error),
    variant: "destructive",
  });
  const finishAction = (id: number, title: string) => {
    invalidateCurrent(id);
    setDialog(null);
    setMotif("");
    setCompteId("");
    setVenteId("");
    setMontantImputation("");
    toast({ title, description: "Le suivi du chèque a été actualisé." });
  };

  const createMutation = useCreerAvanceExportateur({
    mutation: {
      onSuccess: () => {
        invalidateCurrent();
        setDialog(null);
        setForm(blankCreate);
        toast({ title: "Chèque enregistré", description: "L’avance apparaît dans le registre." });
      },
      onError: onMutationError,
    },
  });
  const depositMutation = useDeposerAvanceExportateur({
    mutation: { onSuccess: (_result, variables) => finishAction(variables.id, "Dépôt enregistré"), onError: onMutationError },
  });
  const clearMutation = useEncaisserAvanceExportateur({
    mutation: { onSuccess: (_result, variables) => finishAction(variables.id, "Encaissement confirmé"), onError: onMutationError },
  });
  const rejectMutation = useRejeterAvanceExportateur({
    mutation: { onSuccess: (_result, variables) => finishAction(variables.id, "Chèque rejeté"), onError: onMutationError },
  });
  const cancelMutation = useAnnulerAvanceExportateur({
    mutation: { onSuccess: (_result, variables) => finishAction(variables.id, "Chèque annulé"), onError: onMutationError },
  });
  const allocateMutation = useImputerAvanceExportateur({
    mutation: { onSuccess: (_result, variables) => finishAction(variables.id, "Imputation enregistrée"), onError: onMutationError },
  });
  const isMutating =
    createMutation.isPending || depositMutation.isPending || clearMutation.isPending ||
    rejectMutation.isPending || cancelMutation.isPending || allocateMutation.isPending;

  const visibleAvances = useMemo(() => avances.filter((a) => {
    const matchesStatus = filtre === "tous" || a.statut === filtre;
    const query = recherche.trim().toLocaleLowerCase("fr");
    const matchesQuery = !query || [a.exportateurNom, a.numeroCheque, a.banque].some((value) =>
      value.toLocaleLowerCase("fr").includes(query));
    return matchesStatus && matchesQuery;
  }), [avances, filtre, recherche]);
  const totals = useMemo(() => ({
    avances: avances.length,
    attente: avances.filter(a => a.statut === "a_deposer" || a.statut === "depose").reduce((s, a) => s + a.montantFcfa, 0),
    encaisse: avances.filter(a => a.statut === "encaisse").reduce((s, a) => s + a.montantFcfa, 0),
    disponible: avances.filter(a => a.statut === "encaisse").reduce((s, a) => s + a.montantDisponibleFcfa, 0),
  }), [avances]);

  const openAction = (type: Exclude<DialogState, null>["type"], avance: AvanceExportateur) => {
    setDateAction(today());
    setMotif("");
    setCompteId("");
    setVenteId("");
    setMontantImputation("");
    setDialog({ type, avance } as DialogState);
  };
  const submitCreate = () => {
    if (!form.exportateurId || !form.numeroCheque.trim() || !form.banque.trim() || Number(form.montantFcfa) <= 0 || !form.dateReception) return;
    createMutation.mutate({
      data: {
        exportateurId: Number(form.exportateurId),
        numeroCheque: form.numeroCheque.trim(),
        banque: form.banque.trim(),
        montantFcfa: Number(form.montantFcfa),
        dateReception: form.dateReception,
        ...(form.dateEcheance ? { dateEcheance: form.dateEcheance } : {}),
      },
    });
  };
  const submitAction = () => {
    if (!dialog || dialog.type === "creer") return;
    const { avance, type } = dialog;
    if (type === "deposer") depositMutation.mutate({ id: avance.id, data: { dateDepot: dateAction } });
    if (type === "encaisser" && compteId) clearMutation.mutate({
      id: avance.id, data: { compteBancaireId: Number(compteId), dateEncaissement: dateAction },
    });
    if (type === "rejeter" && motif.trim()) rejectMutation.mutate({
      id: avance.id, data: { motifRejet: motif.trim(), dateRejet: dateAction },
    });
    if (type === "annuler" && motif.trim()) cancelMutation.mutate({
      id: avance.id, data: { motifAnnulation: motif.trim() },
    });
    if (type === "imputer" && venteId && Number(montantImputation) > 0 &&
      Number(montantImputation) <= avance.montantDisponibleFcfa) {
      allocateMutation.mutate({
        id: avance.id,
        data: { venteExportateurId: Number(venteId), montantFcfa: Number(montantImputation) },
      });
    }
  };

  if (!peutLire) {
    return <div className="advance-page"><div className="advance-empty"><ShieldCheck size={28} /><h2>Accès non autorisé</h2><p>Votre profil ne peut pas consulter le registre des avances exportateurs.</p></div></div>;
  }

  const selectedAdvance = detail?.avance ?? avances.find(a => a.id === selectedId);
  const filteredCountLabel = visibleAvances.length === 1 ? "1 chèque" : `${visibleAvances.length} chèques`;
  const selectedSales = ventesEligibles;
  const currentSale = selectedSales.find(v => String(v.id) === venteId);
  const canSubmitDialog = (() => {
    if (!dialog) return false;
    if (dialog.type === "creer") return !!form.exportateurId && !!form.numeroCheque.trim() && !!form.banque.trim() && Number(form.montantFcfa) > 0 && !!form.dateReception;
    if (dialog.type === "deposer") return !!dateAction;
    if (dialog.type === "encaisser") return !!compteId && !!dateAction;
    if (dialog.type === "rejeter" || dialog.type === "annuler") return !!motif.trim() && (dialog.type !== "rejeter" || !!dateAction);
    if (dialog.type === "imputer") return !!venteId && Number(montantImputation) > 0 &&
      Number(montantImputation) <= dialog.avance.montantDisponibleFcfa &&
      Number(montantImputation) <= (currentSale?.soldeDuFcfa ?? 0);
    return false;
  })();

  return (
    <div className="advance-page">
      <style>{`
        .advance-page{--ink:#25332c;--muted:#748078;--line:#e5e8df;--paper:#fbfaf5;--panel:#fffefa;--forest:#254d3b;--forest-deep:#173a2b;--cocoa:#8a5a38;--gold:#bc913a;--gold-pale:#f5edda;--sage:#e8f0e9;--rose:#f8e9e3;--blue:#e8eef0;color:var(--ink);font-family:var(--app-font-sans);max-width:1460px;margin:0 auto;padding:28px 30px 54px}
        .advance-page *{box-sizing:border-box}.advance-page h1,.advance-page h2,.advance-page h3,.advance-page p{margin:0}
        .advance-topline{display:flex;align-items:center;gap:8px;color:var(--forest);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
        .advance-topline i{height:3px;width:20px;background:var(--gold);border-radius:4px}.advance-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:22px;margin:11px 0 25px}
        .advance-heading h1{font-size:clamp(27px,3vw,36px);letter-spacing:-.055em;line-height:1.06;font-weight:800;color:#28382f}.advance-heading p{font-size:13px;color:var(--muted);margin-top:8px;max-width:560px;line-height:1.5}
        .advance-head-actions{display:flex;align-items:center;gap:12px}.advance-live{display:flex;align-items:center;gap:7px;font-size:11px;color:#54715d;font-weight:700;white-space:nowrap}.advance-live b{width:7px;height:7px;border-radius:50%;background:#689274;box-shadow:0 0 0 3px #e2eee4}
        .advance-primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 15px;border:1px solid var(--forest);border-radius:7px;background:var(--forest);color:white;font-size:12px;font-weight:750;transition:background .16s,transform .16s}
        .advance-primary:hover{background:var(--forest-deep);transform:translateY(-1px)}.advance-primary:disabled{opacity:.55;transform:none}
        .advance-metrics{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:18px}
        .advance-metric{position:relative;min-height:104px;overflow:hidden;border:1px solid #e5e5d9;border-radius:9px;background:#fffefa;padding:16px 17px}
        .advance-metric:after{content:"";position:absolute;right:-23px;bottom:-31px;width:86px;height:86px;border:1px solid currentColor;border-radius:50%;opacity:.10}
        .advance-metric-label{display:flex;align-items:center;gap:8px;color:#778078;font-size:10px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}
        .advance-metric-label svg{color:var(--cocoa)}.advance-metric strong{display:block;margin-top:12px;font-size:22px;letter-spacing:-.04em;font-weight:800;line-height:1;color:#2c3a31}
        .advance-metric small{display:block;margin-top:7px;font-size:10px;color:#8b948d}
        .advance-workspace{border:1px solid #e2e5dc;border-radius:10px;background:var(--panel);box-shadow:0 9px 30px rgba(52,62,48,.045);overflow:hidden}
        .advance-toolbar{display:flex;align-items:center;gap:12px;padding:14px 17px;background:#f6f5ee;border-bottom:1px solid var(--line)}
        .advance-search{display:flex;align-items:center;gap:8px;flex:1;max-width:390px;height:36px;padding:0 10px;border:1px solid #dfe2d8;border-radius:6px;background:#fffefa;color:#7e8980}
        .advance-search:focus-within{border-color:#9eae9f;box-shadow:0 0 0 3px rgba(37,77,59,.08)}.advance-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font-size:12px}
        .advance-filter{height:36px;padding:0 30px 0 10px;border:1px solid #dfe2d8;border-radius:6px;background:#fffefa;color:#47564c;font-size:11px;outline:0}
        .advance-count{margin-left:auto;color:#808a81;font-size:11px;font-weight:700;white-space:nowrap}
        .advance-table-wrap{overflow:auto}.advance-table{width:100%;min-width:850px;border-collapse:collapse;font-size:12px}
        .advance-table th{padding:12px 15px;background:#fcfbf6;color:#879087;font-size:9px;letter-spacing:.1em;text-align:left;text-transform:uppercase;font-weight:800}
        .advance-table td{padding:13px 15px;border-top:1px solid #eff0e9;vertical-align:middle}.advance-table tbody tr{transition:background .14s;cursor:pointer}.advance-table tbody tr:hover{background:#faf9f2}
        .advance-exporter{font-weight:750;color:#35463a}.advance-subline{display:block;margin-top:4px;font-family:var(--app-font-mono);font-size:10px;color:#879087}
        .advance-amount{font-family:var(--app-font-mono);font-size:12px;font-weight:600;white-space:nowrap}.advance-balance{color:var(--forest);font-weight:750}
        .advance-status{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:5px;font-size:10px;font-weight:800;white-space:nowrap}
        .advance-status.awaiting{background:#f5edda;color:#88671e}.advance-status.deposited{background:var(--blue);color:#536b72}.advance-status.cleared{background:var(--sage);color:#3b6949}.advance-status.rejected{background:var(--rose);color:#a54e39}.advance-status.cancelled{background:#efefeb;color:#72766f}
        .advance-row-open{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid transparent;border-radius:6px;color:#849087;background:transparent;transition:all .16s}
        tr:hover .advance-row-open{border-color:#e3e6db;background:white;color:var(--forest)}
        .advance-empty,.advance-error{padding:52px 20px;text-align:center;color:#819087}.advance-empty svg,.advance-error svg{color:#a3b1a5;margin:0 auto 12px}.advance-empty h2,.advance-error h2{font-size:15px;color:#435248}.advance-empty p,.advance-error p{margin:6px auto 0;max-width:390px;font-size:12px;line-height:1.55}
        .advance-skeleton{height:58px;border-top:1px solid #eff0e9;background:linear-gradient(90deg,#f7f6f0 25%,#eeeee6 38%,#f7f6f0 62%);background-size:400% 100%;animation:advanceShimmer 1.5s ease infinite}
        @keyframes advanceShimmer{0%{background-position:100% 0}100%{background-position:0 0}}
        .advance-detail-overlay,.advance-dialog-overlay{position:fixed;inset:0;z-index:80;display:flex;justify-content:flex-end;background:rgba(24,39,30,.36);backdrop-filter:blur(2px);animation:advanceFade .16s ease}
        @keyframes advanceFade{from{opacity:0}to{opacity:1}}
        .advance-drawer{height:100%;width:min(680px,100%);overflow:auto;background:var(--paper);box-shadow:-18px 0 60px rgba(20,35,25,.18);animation:advanceSlide .22s ease}
        @keyframes advanceSlide{from{transform:translateX(18px);opacity:.8}to{transform:translateX(0);opacity:1}}
        .advance-drawer-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:15px;padding:20px 24px;background:rgba(251,250,245,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}
        .advance-back{display:inline-flex;align-items:center;gap:6px;border:0;background:none;padding:0;color:#7b877e;font-size:11px;font-weight:700}.advance-close{width:32px;height:32px;border:1px solid var(--line);border-radius:7px;background:white;color:#68766b}
        .advance-detail-content{padding:23px 24px 40px}.advance-detail-title{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
        .advance-detail-title h2{margin-top:6px;font-size:23px;letter-spacing:-.04em}.advance-detail-title p{margin-top:5px;font-family:var(--app-font-mono);font-size:11px;color:#7a867c}
        .advance-detail-total{text-align:right}.advance-detail-total strong{display:block;font-family:var(--app-font-mono);font-size:20px;letter-spacing:-.05em}.advance-detail-total span{font-size:10px;color:#7e8a80}
        .advance-balance-panel{display:grid;grid-template-columns:1fr 1fr;gap:1px;margin-top:20px;border:1px solid #e4e5d9;border-radius:8px;overflow:hidden;background:#e4e5d9}
        .advance-balance-cell{padding:13px;background:#fffefa}.advance-balance-cell span{display:block;color:#879087;font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.advance-balance-cell strong{display:block;margin-top:7px;font-family:var(--app-font-mono);font-size:15px}
        .advance-actionbar{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;padding-bottom:19px;border-bottom:1px solid var(--line)}
        .advance-action{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 10px;border:1px solid #dce2d9;border-radius:6px;background:#fffefa;color:#3e5c48;font-size:10px;font-weight:750;transition:all .15s}
        .advance-action:hover{border-color:#9aab9b;background:#f3f7f2;transform:translateY(-1px)}.advance-action.danger{color:#9b523e}.advance-action:disabled{opacity:.5}
        .advance-section{margin-top:22px}.advance-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:11px}.advance-section h3{font-size:13px;letter-spacing:-.01em}.advance-section-head span{font-size:10px;color:#89928a}
        .advance-timeline{display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding:14px;border:1px solid #e8e9df;border-radius:8px;background:#fffefa}
        .advance-step{position:relative;padding:0 11px 0 0}.advance-step:not(:last-child):after{content:"";position:absolute;top:8px;left:18px;right:4px;height:1px;background:#dfe4dc}
        .advance-step-marker{position:relative;z-index:1;width:16px;height:16px;display:grid;place-items:center;border-radius:50%;border:1px solid #d8ded7;background:#fff;color:#9ca79c}
        .advance-step.done .advance-step-marker{background:#e7f0e7;border-color:#c3d7c4;color:#47734e}.advance-step.current .advance-step-marker{background:#f5edda;border-color:#e8d7ad;color:#99742b}
        .advance-step strong{display:block;margin-top:9px;font-size:10px}.advance-step span{display:block;margin-top:4px;font-size:9px;color:#879087}
        .advance-reason{margin-top:13px;padding:11px 13px;border-left:3px solid #b96e54;background:#fbf1ec;border-radius:0 6px 6px 0;font-size:11px;color:#805344}
        .advance-list{border:1px solid #e7e9df;border-radius:7px;overflow:hidden;background:#fffefa}.advance-list-row{display:flex;justify-content:space-between;gap:12px;padding:11px 13px;border-bottom:1px solid #eff0e9;font-size:11px}.advance-list-row:last-child{border:0}.advance-list-row strong{font-family:var(--app-font-mono);font-size:11px}.advance-list-row small{display:block;margin-top:4px;color:#859087;font-size:9px}
        .advance-sale-card{display:grid;grid-template-columns:1fr auto;gap:9px;padding:12px 13px;border-bottom:1px solid #eff0e9}.advance-sale-card:last-child{border:0}.advance-sale-card strong{font-size:11px}.advance-sale-card small{display:block;margin-top:4px;color:#859087;font-size:9px}.advance-sale-card .sale-balance{text-align:right;font-family:var(--app-font-mono);font-size:11px;font-weight:700}
        .advance-dialog-overlay{justify-content:center;align-items:center;padding:16px;background:rgba(24,39,30,.43)}.advance-dialog{width:min(500px,100%);max-height:min(90dvh,760px);overflow:auto;border:1px solid #e5e5db;border-radius:10px;background:#fffefa;box-shadow:0 24px 80px rgba(17,36,24,.22);animation:advanceDialogIn .18s ease}
        @keyframes advanceDialogIn{from{transform:translateY(8px);opacity:.7}to{transform:translateY(0);opacity:1}}
        .advance-dialog-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;padding:18px 20px;border-bottom:1px solid #ecece3}.advance-dialog-head h2{font-size:16px;letter-spacing:-.02em}.advance-dialog-head p{margin-top:5px;font-size:11px;color:#828d84;line-height:1.45}
        .advance-dialog-body{display:grid;gap:13px;padding:18px 20px}.advance-field label{display:block;margin-bottom:6px;color:#647168;font-size:10px;font-weight:800;letter-spacing:.03em}
        .advance-field input,.advance-field select,.advance-field textarea{display:block;width:100%;min-height:39px;padding:9px 10px;border:1px solid #dfe2d9;border-radius:6px;background:#fffefa;color:#314137;font-size:12px;outline:none}
        .advance-field textarea{min-height:82px;resize:vertical}.advance-field input:focus,.advance-field select:focus,.advance-field textarea:focus{border-color:#8da08f;box-shadow:0 0 0 3px rgba(37,77,59,.09)}
        .advance-two-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.advance-callout{display:flex;gap:9px;padding:11px 12px;border:1px solid #e5e6dc;border-radius:6px;background:#f8f7f1;color:#67766a;font-size:10px;line-height:1.5}.advance-callout svg{flex:none;color:#99762e}
        .advance-dialog-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px 19px;border-top:1px solid #ecece3}.advance-secondary{min-height:37px;padding:0 13px;border:1px solid #dfe2d9;border-radius:6px;background:#fffefa;color:#68756b;font-size:11px;font-weight:750}
        .advance-dialog-foot .advance-primary{min-height:37px}.advance-dialog-foot .advance-primary:disabled{cursor:not-allowed}
        @media(max-width:800px){.advance-page{padding:20px 16px 40px}.advance-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.advance-heading{align-items:flex-start}.advance-head-actions{flex-direction:column-reverse;align-items:flex-end}}
        @media(max-width:560px){.advance-page{padding:17px 12px 30px}.advance-heading{display:block}.advance-head-actions{margin-top:16px;flex-direction:row;justify-content:space-between;align-items:center}.advance-heading h1{font-size:28px}.advance-metrics{gap:8px}.advance-metric{padding:13px;min-height:94px}.advance-metric strong{font-size:18px}.advance-toolbar{flex-wrap:wrap;padding:12px}.advance-search{max-width:none;flex-basis:100%}.advance-filter{flex:1}.advance-count{margin-left:0}.advance-drawer-head{padding:15px 16px}.advance-detail-content{padding:19px 16px 32px}.advance-detail-title{display:block}.advance-detail-total{text-align:left;margin-top:13px}.advance-detail-total strong{font-size:19px}.advance-timeline{padding:11px 8px}.advance-step{padding-right:4px}.advance-step strong{font-size:9px}.advance-step span{font-size:8px}.advance-two-fields{grid-template-columns:1fr}}
        @media(prefers-reduced-motion:reduce){.advance-page *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
      `}</style>

      <div className="advance-topline"><i /> Trésorerie exportateurs <span>/</span> Chèques d’avance</div>
      <header className="advance-heading">
        <div>
          <h1>Avances exportateurs</h1>
          <p>Suivez chaque chèque reçu avant les ventes, de son dépôt bancaire à son imputation sur une vente réelle.</p>
        </div>
        <div className="advance-head-actions">
          <span className="advance-live"><b /> Registre à jour</span>
          {peutCreer && <button className="advance-primary" onClick={() => setDialog({ type: "creer" })} data-testid="button-create-advance"><Plus size={15} /> Enregistrer un chèque</button>}
        </div>
      </header>

      <section className="advance-metrics" aria-label="Synthèse des avances">
        <div className="advance-metric"><div className="advance-metric-label"><ReceiptText size={14} /> Chèques suivis</div><strong>{avancesQuery.isLoading ? "—" : avances.length}</strong><small>{totals.avances === 1 ? "1 dossier dans le registre" : `${totals.avances} dossiers dans le registre`}</small></div>
        <div className="advance-metric"><div className="advance-metric-label"><Clock3 size={14} /> En cours de dépôt</div><strong>{avancesQuery.isLoading ? "—" : fmtMoney(totals.attente)}</strong><small>Reçus ou déposés, non encore encaissés</small></div>
        <div className="advance-metric"><div className="advance-metric-label"><Landmark size={14} /> Encaissements confirmés</div><strong>{avancesQuery.isLoading ? "—" : fmtMoney(totals.encaisse)}</strong><small>Montant effectivement crédité en banque</small></div>
        <div className="advance-metric"><div className="advance-metric-label"><CircleDollarSign size={14} /> Disponible à imputer</div><strong>{avancesQuery.isLoading ? "—" : fmtMoney(totals.disponible)}</strong><small>Solde non affecté aux ventes</small></div>
      </section>

      <section className="advance-workspace">
        <div className="advance-toolbar">
          <label className="advance-search"><Search size={15} /><input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Exportateur, numéro de chèque, banque…" aria-label="Rechercher un chèque" data-testid="input-search-advance" /></label>
          <select className="advance-filter" value={filtre} onChange={e => setFiltre(e.target.value as typeof filtre)} aria-label="Filtrer par statut" data-testid="select-advance-status">
            <option value="tous">Tous les statuts</option><option value="a_deposer">À déposer</option><option value="depose">Déposés</option><option value="encaisse">Encaissés</option><option value="rejete">Rejetés</option><option value="annule">Annulés</option>
          </select>
          <span className="advance-count">{filteredCountLabel}</span>
        </div>
        {avancesQuery.isLoading ? (
          <div aria-label="Chargement du registre"><div className="advance-skeleton" /><div className="advance-skeleton" /><div className="advance-skeleton" /><div className="advance-skeleton" /></div>
        ) : avancesQuery.isError ? (
          <div className="advance-error"><AlertCircle size={27} /><h2>Registre indisponible</h2><p>{errorText(avancesQuery.error)}</p><button className="advance-primary" style={{ marginTop: 15 }} onClick={() => void avancesQuery.refetch()} data-testid="button-retry-advances">Réessayer</button></div>
        ) : visibleAvances.length === 0 ? (
          <div className="advance-empty"><FileCheck2 size={30} /><h2>{recherche || filtre !== "tous" ? "Aucun chèque correspondant" : "Aucun chèque d’avance"}</h2><p>{recherche || filtre !== "tous" ? "Modifiez vos critères pour retrouver un dossier." : "Les chèques remis par les exportateurs avant les ventes seront suivis ici."}</p>{peutCreer && !recherche && filtre === "tous" && <button className="advance-primary" style={{ marginTop: 16 }} onClick={() => setDialog({ type: "creer" })}><Plus size={14} /> Enregistrer le premier chèque</button>}</div>
        ) : (
          <div className="advance-table-wrap">
            <table className="advance-table">
              <thead><tr><th>Exportateur / chèque</th><th>Réception</th><th>Montant initial</th><th>Disponible</th><th>Statut</th><th aria-label="Détail" /></tr></thead>
              <tbody>
                {visibleAvances.map(avance => {
                  const st = STATUS[avance.statut];
                  const Icon = st.icon;
                  return <tr key={avance.id} onClick={() => setSelectedId(avance.id)} data-testid={`row-advance-${avance.id}`}>
                    <td><span className="advance-exporter">{avance.exportateurNom}</span><span className="advance-subline">Chq. {avance.numeroCheque} · {avance.banque}</span></td>
                    <td>{fmtDate(avance.dateReception)}{avance.dateEcheance && <span className="advance-subline">Échéance {fmtDate(avance.dateEcheance)}</span>}</td>
                    <td className="advance-amount">{fmtMoney(avance.montantFcfa)}<span className="advance-subline">Imputé {fmtMoney(avance.montantImputeFcfa)}</span></td>
                    <td className="advance-amount advance-balance">{fmtMoney(avance.statut === "encaisse" ? avance.montantDisponibleFcfa : 0)}</td>
                    <td><span className={`advance-status ${st.tone}`}><Icon size={12} />{st.label}</span></td>
                    <td><button className="advance-row-open" aria-label={`Voir le chèque ${avance.numeroCheque}`} onClick={e => { e.stopPropagation(); setSelectedId(avance.id); }} data-testid={`button-detail-advance-${avance.id}`}><ChevronRight size={16} /></button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedId !== null && (
        <div className="advance-detail-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedId(null); }}>
          <aside className="advance-drawer" aria-label="Détail du chèque d’avance">
            <div className="advance-drawer-head"><button className="advance-back" onClick={() => setSelectedId(null)}><ArrowLeft size={14} /> Retour au registre</button><button className="advance-close" aria-label="Fermer le détail" onClick={() => setSelectedId(null)}><X size={16} /></button></div>
            {detailLoading && !selectedAdvance ? <div className="advance-detail-content"><div className="advance-skeleton" /><div className="advance-skeleton" /><div className="advance-skeleton" /></div> :
              detailError ? <div className="advance-error"><AlertCircle size={25} /><h2>Détail indisponible</h2><p>Impossible de charger l’historique de ce chèque.</p><button className="advance-primary" style={{ marginTop: 14 }} onClick={() => void refetchDetail()}>Réessayer</button></div> :
              selectedAdvance && <>
                <div className="advance-detail-content">
                  <div className="advance-detail-title">
                    <div><span className={`advance-status ${STATUS[selectedAdvance.statut].tone}`}>{STATUS[selectedAdvance.statut].label}</span><h2>{selectedAdvance.exportateurNom}</h2><p>CHÈQUE {selectedAdvance.numeroCheque} · {selectedAdvance.banque}</p></div>
                    <div className="advance-detail-total"><strong>{fmtMoney(selectedAdvance.montantFcfa)}</strong><span>Montant du chèque</span></div>
                  </div>
                  <div className="advance-balance-panel">
                    <div className="advance-balance-cell"><span>Déjà imputé</span><strong>{fmtMoney(selectedAdvance.montantImputeFcfa)}</strong></div>
                    <div className="advance-balance-cell"><span>Reste disponible</span><strong>{fmtMoney(selectedAdvance.statut === "encaisse" ? selectedAdvance.montantDisponibleFcfa : 0)}</strong></div>
                  </div>
                  <div className="advance-actionbar">
                    {selectedAdvance.statut === "a_deposer" && peutDeposer && <button className="advance-action" onClick={() => openAction("deposer", selectedAdvance)}><ArrowDownToLine size={13} /> Marquer déposé</button>}
                    {selectedAdvance.statut === "depose" && peutEncaisser && <button className="advance-action" onClick={() => openAction("encaisser", selectedAdvance)}><CheckCircle2 size={13} /> Confirmer l’encaissement</button>}
                    {selectedAdvance.statut === "encaisse" && selectedAdvance.montantDisponibleFcfa > 0 && peutEncaisser && <button className="advance-action" onClick={() => openAction("imputer", selectedAdvance)}><ArrowRight size={13} /> Imputer sur une vente</button>}
                    {(selectedAdvance.statut === "a_deposer" || selectedAdvance.statut === "depose") && peutRejeter && <button className="advance-action danger" onClick={() => openAction("rejeter", selectedAdvance)}><XCircle size={13} /> Rejeter</button>}
                    {(selectedAdvance.statut === "a_deposer" || selectedAdvance.statut === "depose") && peutAnnuler && <button className="advance-action danger" onClick={() => openAction("annuler", selectedAdvance)}><X size={13} /> Annuler le chèque</button>}
                    {selectedAdvance.statut === "encaisse" && selectedAdvance.montantDisponibleFcfa <= 0 && <span className="advance-callout"><Check size={14} /> Le montant encaissé a été intégralement affecté aux ventes.</span>}
                  </div>
                  <section className="advance-section">
                    <div className="advance-section-head"><h3>Cycle du chèque</h3><span>Réception → banque</span></div>
                    <div className="advance-timeline">
                      <div className="advance-step done"><i className="advance-step-marker"><Check size={9} /></i><strong>Reçu</strong><span>{fmtDate(selectedAdvance.dateReception)}</span></div>
                      <div className={`advance-step ${selectedAdvance.dateDepot ? "done" : selectedAdvance.statut === "a_deposer" ? "current" : ""}`}><i className="advance-step-marker">{selectedAdvance.dateDepot ? <Check size={9} /> : <ArrowDownToLine size={8} />}</i><strong>Déposé</strong><span>{fmtDate(selectedAdvance.dateDepot)}</span></div>
                      <div className={`advance-step ${selectedAdvance.dateEncaissement ? "done" : selectedAdvance.statut === "depose" ? "current" : ""}`}><i className="advance-step-marker">{selectedAdvance.dateEncaissement ? <Check size={9} /> : <Landmark size={8} />}</i><strong>Encaissé</strong><span>{fmtDate(selectedAdvance.dateEncaissement)}</span></div>
                    </div>
                    {(selectedAdvance.statut === "rejete" || selectedAdvance.statut === "annule") && <div className="advance-reason"><strong>{selectedAdvance.statut === "rejete" ? "Motif du rejet" : "Motif de l’annulation"} · </strong>{selectedAdvance.motifRejet ?? selectedAdvance.motifAnnulation ?? "Motif non renseigné"}<span> — {fmtDate(selectedAdvance.dateRejet ?? selectedAdvance.dateAnnulation)}</span></div>}
                  </section>
                  <section className="advance-section">
                    <div className="advance-section-head"><h3>Ventes ouvertes du même exportateur</h3><span>{ventesEligibles.length} éligible{ventesEligibles.length === 1 ? "" : "s"}</span></div>
                    {selectedAdvance.statut !== "encaisse" ? <div className="advance-callout"><AlertCircle size={14} /> L’imputation est disponible après confirmation de l’encaissement bancaire.</div> :
                      ventesLoading ? <div className="advance-skeleton" /> : ventesError ? <div className="advance-callout"><AlertCircle size={14} /> Les ventes éligibles n’ont pas pu être chargées.</div> :
                      selectedSales.length === 0 ? <div className="advance-callout"><CheckCircle2 size={14} /> Aucune vente ouverte à solder pour cet exportateur.</div> :
                      <div className="advance-list">{selectedSales.map(vente => <div className="advance-sale-card" key={vente.id}><div><strong>Vente du {fmtDate(vente.dateVente)}</strong><small>{Number(vente.poidsKg).toLocaleString("fr-FR")} kg · {fmtMoney(vente.montantTotalFcfa)} · {vente.statut}</small></div><div className="sale-balance">{fmtMoney(vente.soldeDuFcfa)}<small>Solde dû</small></div></div>)}</div>}
                  </section>
                  <section className="advance-section">
                    <div className="advance-section-head"><h3><History size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Imputations enregistrées</h3><span>{detail?.imputations.length ?? 0} ligne{(detail?.imputations.length ?? 0) === 1 ? "" : "s"}</span></div>
                    {!detail?.imputations.length ? <div className="advance-callout"><Banknote size={14} /> Aucune imputation effectuée à ce jour.</div> :
                      <div className="advance-list">{detail.imputations.map(imp => <div className="advance-list-row" key={imp.id}><div><strong>Vente du {fmtDate(imp.dateVente)}</strong><small>Imputé le {fmtDate(imp.dateImputation)} · Réf. vente #{imp.venteExportateurId}{imp.montantRestitueFcfa > 0 ? ` · Restitué ${fmtMoney(imp.montantRestitueFcfa)} le ${fmtDate(imp.dateRestitution)}` : ""}</small></div><strong>{fmtMoney(imp.montantFcfa)}</strong></div>)}</div>}
                  </section>
                  <section className="advance-section">
                    <div className="advance-section-head"><h3>Références</h3><span>Traçabilité</span></div>
                    <div className="advance-list">
                      <div className="advance-list-row"><div>Date de réception</div><strong>{fmtDate(selectedAdvance.dateReception)}</strong></div>
                      <div className="advance-list-row"><div>Date d’échéance</div><strong>{fmtDate(selectedAdvance.dateEcheance)}</strong></div>
                      {selectedAdvance.dateEncaissement && <div className="advance-list-row"><div>Compte crédité</div><strong>{selectedAdvance.compteBancaireId ? `Compte #${selectedAdvance.compteBancaireId}` : "—"}</strong></div>}
                      {selectedAdvance.mouvementBanqueId && <div className="advance-list-row"><div>Mouvement bancaire</div><strong>#{selectedAdvance.mouvementBanqueId}</strong></div>}
                      <div className="advance-list-row"><div>Créé le</div><strong>{fmtDate(selectedAdvance.createdAt)}</strong></div>
                    </div>
                  </section>
                </div>
              </>}
          </aside>
        </div>
      )}

      {dialog && (
        <div className="advance-dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !isMutating) setDialog(null); }}>
          <section className="advance-dialog" role="dialog" aria-modal="true">
            <div className="advance-dialog-head"><div><h2>
              {dialog.type === "creer" ? "Enregistrer un chèque reçu" :
                dialog.type === "deposer" ? "Confirmer le dépôt" :
                  dialog.type === "encaisser" ? "Confirmer l’encaissement bancaire" :
                    dialog.type === "rejeter" ? "Rejeter le chèque" :
                      dialog.type === "annuler" ? "Annuler le chèque" : "Imputer sur une vente"}
            </h2><p>{dialog.type === "creer" ? "Saisissez les références telles qu’elles figurent sur le chèque remis." : dialog.type === "imputer" ? "Seules les ventes réelles ouvertes de cet exportateur peuvent recevoir une imputation." : "Cette action sera inscrite dans l’historique du chèque."}</p></div><button className="advance-close" aria-label="Fermer" onClick={() => !isMutating && setDialog(null)}><X size={16} /></button></div>
            {dialog.type === "creer" ? (
              <div className="advance-dialog-body">
                <div className="advance-field"><label>Exportateur *</label><select value={form.exportateurId} onChange={e => setForm(f => ({ ...f, exportateurId: e.target.value }))} data-testid="select-exporter"><option value="">{exportateursLoading ? "Chargement des exportateurs…" : "Sélectionner un exportateur"}</option>{(exportateurs as ExportateurDetail[]).map(exp => <option key={exp.id} value={exp.id}>{exp.nom}</option>)}</select>
                  {exportateursError && <button className="advance-back" style={{ marginTop: 7 }} onClick={() => void refetchExportateurs()}>Exportateurs indisponibles — réessayer</button>}
                  {!exportateursLoading && !exportateursError && exportateurs.length === 0 && <small style={{ display: "block", marginTop: 6, color: "#a4513c", fontSize: 10 }}>Aucun exportateur enregistré. Ajoutez-en un avant de saisir un chèque.</small>}
                </div>
                <div className="advance-two-fields"><div className="advance-field"><label>Numéro du chèque *</label><input value={form.numeroCheque} onChange={e => setForm(f => ({ ...f, numeroCheque: e.target.value }))} placeholder="Ex. 0084172" maxLength={80} data-testid="input-check-number" /></div><div className="advance-field"><label>Banque émettrice *</label><input value={form.banque} onChange={e => setForm(f => ({ ...f, banque: e.target.value }))} placeholder="Ex. BICICI" maxLength={200} data-testid="input-check-bank" /></div></div>
                <div className="advance-two-fields"><div className="advance-field"><label>Montant (FCFA) *</label><MoneyInput min="1" value={form.montantFcfa} onChange={montantFcfa => setForm(f => ({ ...f, montantFcfa }))} placeholder="0" data-testid="input-check-amount" /></div><div className="advance-field"><label>Date de réception *</label><input type="date" value={form.dateReception} onChange={e => setForm(f => ({ ...f, dateReception: e.target.value }))} data-testid="input-received-date" /></div></div>
                <div className="advance-field"><label>Date d’échéance <span style={{ fontWeight: 500, color: "#89928a" }}>· facultative</span></label><input type="date" value={form.dateEcheance} onChange={e => setForm(f => ({ ...f, dateEcheance: e.target.value }))} data-testid="input-due-date" /></div>
                <div className="advance-callout"><ShieldCheck size={14} /> L’enregistrement crée uniquement le suivi du chèque. Il ne crée ni vente ni paiement.</div>
              </div>
            ) : dialog.type === "imputer" ? (
              <div className="advance-dialog-body">
                <div className="advance-callout"><CircleDollarSign size={14} /> Disponible sur ce chèque : <strong>{fmtMoney(dialog.avance.montantDisponibleFcfa)}</strong>. L’imputation ne peut dépasser ni ce montant ni le solde de la vente.</div>
                <div className="advance-field"><label>Vente réelle à solder *</label><select value={venteId} onChange={e => { setVenteId(e.target.value); const sale = ventesEligibles.find(v => String(v.id) === e.target.value); if (sale) setMontantImputation(String(Math.min(dialog.avance.montantDisponibleFcfa, sale.soldeDuFcfa))); }} data-testid="select-eligible-sale"><option value="">Choisir une vente ouverte</option>{ventesEligibles.map(v => <option key={v.id} value={v.id}>Vente du {fmtDate(v.dateVente)} · solde {fmtMoney(v.soldeDuFcfa)}</option>)}</select></div>
                {currentSale && <div className="advance-callout"><CalendarDays size={14} /><span>Vente du {fmtDate(currentSale.dateVente)} · {Number(currentSale.poidsKg).toLocaleString("fr-FR")} kg · Solde restant {fmtMoney(currentSale.soldeDuFcfa)}</span></div>}
                <div className="advance-field"><label>Montant à imputer (FCFA) *</label><input type="number" min="1" max={Math.min(dialog.avance.montantDisponibleFcfa, currentSale?.soldeDuFcfa ?? 0)} step="1" value={montantImputation} onChange={e => setMontantImputation(e.target.value)} data-testid="input-allocation-amount" /><small style={{ display: "block", marginTop: 5, color: "#859087", fontSize: 10 }}>Plafond autorisé : {fmtMoney(Math.min(dialog.avance.montantDisponibleFcfa, currentSale?.soldeDuFcfa ?? 0))}</small></div>
                <div className="advance-callout"><AlertCircle size={14} /> Cette opération affecte l’avance à une vente existante uniquement. Aucun règlement ni paiement ne sera créé.</div>
              </div>
            ) : (
              <div className="advance-dialog-body">
                {(dialog.type === "deposer" || dialog.type === "encaisser" || dialog.type === "rejeter") && <div className="advance-field"><label>{dialog.type === "deposer" ? "Date de dépôt *" : dialog.type === "encaisser" ? "Date d’encaissement *" : "Date du rejet *"}</label><input type="date" value={dateAction} onChange={e => setDateAction(e.target.value)} data-testid="input-action-date" /></div>}
                {dialog.type === "encaisser" && <div className="advance-field"><label>Compte bancaire crédité *</label><select value={compteId} onChange={e => setCompteId(e.target.value)} data-testid="select-bank-account"><option value="">{comptesLoading ? "Chargement des comptes…" : "Sélectionner le compte"}</option>{comptes.map(compte => <option key={compte.id} value={compte.id}>{compte.nom} · {compte.banque}{compte.numero_compte ? ` · ${compte.numero_compte}` : ""}</option>)}</select>{comptesError && <button className="advance-back" style={{ marginTop: 7 }} onClick={() => void refetchComptes()}>Comptes indisponibles — réessayer</button>}{!comptesLoading && !comptesError && comptes.length === 0 && <small style={{ color: "#a4513c", display: "block", marginTop: 6, fontSize: 10 }}>Aucun compte bancaire disponible. L’encaissement ne peut pas être confirmé.</small>}</div>}
                {(dialog.type === "rejeter" || dialog.type === "annuler") && <div className="advance-field"><label>{dialog.type === "rejeter" ? "Motif du rejet *" : "Motif de l’annulation *"}</label><textarea value={motif} onChange={e => setMotif(e.target.value)} maxLength={500} placeholder={dialog.type === "rejeter" ? "Précisez le motif communiqué par la banque…" : "Indiquez la raison de l’annulation…"} data-testid="input-action-reason" /></div>}
                <div className="advance-callout"><AlertCircle size={14} /> {dialog.type === "deposer" ? "Le statut passera à « Déposé ». L’imputation restera indisponible jusqu’à l’encaissement confirmé." : dialog.type === "encaisser" ? "La confirmation d’encaissement est requise avant toute imputation sur les ventes." : "Cette décision sera conservée dans l’historique du chèque."}</div>
              </div>
            )}
            <div className="advance-dialog-foot"><button className="advance-secondary" onClick={() => !isMutating && setDialog(null)}>Retour</button><button className="advance-primary" disabled={!canSubmitDialog || isMutating || (dialog.type === "encaisser" && (comptesLoading || comptes.length === 0)) || (dialog.type === "imputer" && (ventesLoading || ventesError || ventesEligibles.length === 0))} onClick={dialog.type === "creer" ? submitCreate : submitAction} data-testid="button-confirm-advance">
              {isMutating ? <><LoaderCircle size={14} /> Enregistrement…</> : dialog.type === "creer" ? <><Plus size={14} /> Enregistrer le chèque</> : dialog.type === "imputer" ? <><ArrowRight size={14} /> Imputer le montant</> : dialog.type === "deposer" ? <><ArrowDownToLine size={14} /> Confirmer le dépôt</> : dialog.type === "encaisser" ? <><CheckCircle2 size={14} /> Confirmer l’encaissement</> : dialog.type === "rejeter" ? <><XCircle size={14} /> Confirmer le rejet</> : <><X size={14} /> Confirmer l’annulation</>}
            </button></div>
          </section>
        </div>
      )}
    </div>
  );
}
import { useState } from "react";
import {
  CheckCircle2, Clock, XCircle, Loader2, CreditCard, Search,
  CheckCheck, AlertCircle, Banknote, Smartphone, ChevronDown,
  Receipt, Package, User, Calendar, TrendingUp, X, Wallet,
  AlertTriangle, Lock, FileDown, Printer, Fuel, Ship,
} from "lucide-react";
import {
  useListPaiements,
  useValiderPaiement,
  useRejeterPaiement,
  useGetPaiementsStats,
  ListPaiementsStatut,
  ListPaiementsPeriode,
  GetPaiementsStatsPeriode,
  type PaiementListItem,
  type ValiderPaiementInputModePaiement,
  type VentilationPaiementInput,
  getListPaiementsQueryKey,
  getGetPaiementsStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

function nomProducteur(p: PaiementListItem) {
  if (p.bonCarburantNumero) return `Carburant — ${p.bonCarburantNumero}`;
  if (p.depenseVehiculeId) return `Pièce de rechange — ${p.depenseVehiculeLibelle ?? `Bon BAP-${String(p.depenseVehiculeId).padStart(5, "0")}`}`;
  const nom = p.membreNom ?? p.fournisseurNom ?? "";
  const prenoms = p.membrePrenoms ?? p.fournisseurPrenoms ?? "";
  return `${nom} ${prenoms}`.trim() || "—";
}
function telProducteur(p: PaiementListItem) {
  return p.telephone ?? p.fournisseurTelephone ?? null;
}
function isBonCarburant(p: PaiementListItem) {
  return !!p.bonCarburantId;
}
function livraisonAvecSolde(p: PaiementListItem) {
  const statut = (p.livraisonStatutPaiement ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
  return !!p.livraisonId && ["EN_ATTENTE", "PARTIEL", "DIFFERE"].includes(statut);
}
function montantRestantLivraison(p: PaiementListItem) {
  return livraisonAvecSolde(p)
    ? Math.max(0, p.livraisonMontantRestant ?? p.montantFcfa)
    : p.montantFcfa;
}
function montantEspeces(p: PaiementListItem) {
  if (p.lignes?.length) {
    return p.lignes
      .filter((ligne) => ligne.modePaiement === "especes")
      .reduce((total, ligne) => total + ligne.montantFcfa, 0);
  }
  return p.modePaiement === "especes" ? (p.montantNetFcfa ?? p.montantFcfa ?? 0) : 0;
}

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string) =>
  fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } }).then((r) => r.json());

async function apiFetchChecked<T>(url: string): Promise<T> {
  const response = await fetch(`${BASE}${url}`, {
    headers: { Authorization: `Bearer ${tok()}` },
  });
  const payload = await response.json().catch(() => null) as { erreur?: string } | T | null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "erreur" in payload
      ? String(payload.erreur)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

async function apiPostChecked<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tok()}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { erreur?: string } | T | null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "erreur" in payload
      ? String(payload.erreur)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

type FraisTransportARegler = {
  id: number;
  numeroExpedition: string;
  statut: string;
  port: string;
  transporteur: string | null;
  nomChauffeur: string | null;
  dateArriveePort: string | null;
  fraisTransportFcfa: string | number;
  fraisTransportStatut: string;
  exportateurNom: string | null;
};

type CaisseTransport = {
  id: number;
  nom: string;
  solde_actuel_fcfa: string;
  session_id: number | null;
  session_statut: string | null;
};

type CompteBancaireTransport = {
  id: number;
  nom: string;
  banque: string;
  solde_actuel_fcfa: string;
};
// ─── Formatters ─────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

function parseMontantSaisi(value: string) {
  const chiffres = value.replace(/\D/g, "");
  return chiffres ? Number(chiffres) : 0;
}

function formatMontantSaisi(value: string | number) {
  const montant = typeof value === "number" ? value : parseMontantSaisi(value);
  return montant > 0 ? new Intl.NumberFormat("fr-FR").format(montant) : value === "" ? "" : "0";
}

function fmtPoids(p: string | null | undefined) {
  if (!p) return "—";
  return parseFloat(p).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " kg";
}

// ─── Badges ─────────────────────────────────────────────────────────────────

const STATUT_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  en_attente: { label: "En attente",   cls: "bg-amber-100 text-amber-700",  icon: <Clock size={11} /> },
  confirme:   { label: "Confirmé",     cls: "bg-green-100 text-green-700",  icon: <CheckCircle2 size={11} /> },
  effectue:   { label: "Effectué",     cls: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 size={11} /> },
  en_cours:   { label: "En cours",     cls: "bg-blue-100 text-blue-700",    icon: <Loader2 size={11} className="animate-spin" /> },
  rejete:     { label: "Rejeté",       cls: "bg-red-100 text-red-700",      icon: <XCircle size={11} /> },
  echec:      { label: "Échec",        cls: "bg-rose-100 text-rose-700",    icon: <AlertCircle size={11} /> },
};

const MODE_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  orange_money: { label: "Orange Money",     cls: "bg-orange-100 text-orange-700", icon: <Smartphone size={11} /> },
  mtn_momo:     { label: "MTN MoMo",         cls: "bg-yellow-100 text-yellow-700", icon: <Smartphone size={11} /> },
  especes:      { label: "Espèces",          cls: "bg-gray-100 text-gray-600",     icon: <Banknote size={11} /> },
  wave:         { label: "Wave",             cls: "bg-blue-100 text-blue-700",     icon: <Smartphone size={11} /> },
  cheque:       { label: "Chèque",           cls: "bg-purple-100 text-purple-700", icon: <CreditCard size={11} /> },
  virement:     { label: "Virement bancaire", cls: "bg-indigo-100 text-indigo-700", icon: <CreditCard size={11} /> },
};

function StatutBadge({ statut }: { statut: string }) {
  const cfg = STATUT_CONFIG[statut] ?? { label: statut, cls: "bg-gray-100 text-gray-500", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ModeBadge({
  mode,
  statut,
}: {
  mode: string | null | undefined;
  statut?: string | null;
}) {
  if (!mode) return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${
      statut === "confirme" || statut === "effectue"
        ? "bg-gray-100 text-gray-600 border-gray-200"
        : "bg-amber-100 text-amber-700 border-amber-200"
    }`}>
      <AlertCircle size={11} />
      {statut === "confirme" || statut === "effectue" ? "Mode non renseigné" : "À régler"}
    </span>
  );
  const cfg = MODE_CONFIG[mode] ?? { label: mode, cls: "bg-gray-100 text-gray-500", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ModalReglementTransport({
  expedition,
  caisses,
  comptesBancaires,
  isDelegue,
  onClose,
  onConfirm,
  loading,
}: {
  expedition: FraisTransportARegler;
  caisses: CaisseTransport[];
  comptesBancaires: CompteBancaireTransport[];
  isDelegue: boolean;
  onClose: () => void;
  onConfirm: (input: {
    modePaiement: "especes" | "banque";
    caisseId?: number;
    compteBancaireId?: number;
    reference?: string;
  }) => void;
  loading: boolean;
}) {
  const [mode, setMode] = useState<"especes" | "banque">("especes");
  const [caisseId, setCaisseId] = useState("");
  const [compteBancaireId, setCompteBancaireId] = useState("");
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);

  const caissesOuvertes = caisses.filter(
    (caisse) => caisse.session_id !== null && caisse.session_statut === "ouverte",
  );
  const ressourceManquante = mode === "especes" ? !caisseId : !compteBancaireId;

  function handleConfirm() {
    if (ressourceManquante) {
      setTouched(true);
      return;
    }
    onConfirm({
      modePaiement: mode,
      ...(mode === "especes"
        ? { caisseId: Number(caisseId) }
        : { compteBancaireId: Number(compteBancaireId) }),
      reference: reference.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <Ship size={18} className="text-blue-700" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 text-sm">Régler les frais d’exportation</h3>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{expedition.numeroExpedition}</p>
            </div>
            <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600" aria-label="Fermer">
              <X size={16} />
            </button>
          </div>

          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Transporteur</span>
              <span className="font-medium text-gray-800 text-right">
                {expedition.transporteur || expedition.nomChauffeur || "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Port</span>
              <span className="font-medium text-gray-800">{expedition.port}</span>
            </div>
            <div className="border-t border-blue-100 pt-2 mt-2 flex justify-between items-center">
              <span className="font-semibold text-gray-700">Montant à régler</span>
              <span className="text-xl font-bold text-blue-800">{fmt(Number(expedition.fraisTransportFcfa))}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Mode de règlement <span className="text-red-500">*</span>
            </label>
            <select
              value={mode}
              onChange={(event) => {
                const nextMode = event.target.value as "especes" | "banque";
                setMode(nextMode);
                setCaisseId("");
                setCompteBancaireId("");
                setTouched(false);
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              <option value="especes">Espèces — caisse</option>
              {!isDelegue && <option value="banque">Banque</option>}
            </select>
          </div>

          {mode === "especes" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Caisse ouverte <span className="text-red-500">*</span>
              </label>
              <select
                value={caisseId}
                onChange={(event) => { setCaisseId(event.target.value); setTouched(false); }}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white ${
                  touched && !caisseId ? "border-red-400 bg-red-50" : "border-gray-200"
                }`}
              >
                <option value="">— Sélectionner une caisse ouverte —</option>
                {caissesOuvertes.map((caisse) => (
                  <option key={caisse.id} value={String(caisse.id)}>
                    {caisse.nom} — {Number(caisse.solde_actuel_fcfa).toLocaleString("fr-FR")} FCFA
                  </option>
                ))}
              </select>
              {caissesOuvertes.length === 0 && (
                <p className="text-xs text-orange-600 mt-1">Aucune caisse n’est ouverte aujourd’hui.</p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Compte bancaire actif <span className="text-red-500">*</span>
              </label>
              <select
                value={compteBancaireId}
                onChange={(event) => { setCompteBancaireId(event.target.value); setTouched(false); }}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white ${
                  touched && !compteBancaireId ? "border-red-400 bg-red-50" : "border-gray-200"
                }`}
              >
                <option value="">— Sélectionner un compte bancaire —</option>
                {comptesBancaires.map((compte) => (
                  <option key={compte.id} value={String(compte.id)}>
                    {compte.nom} — {compte.banque} ({Number(compte.solde_actuel_fcfa).toLocaleString("fr-FR")} FCFA)
                  </option>
                ))}
              </select>
              {comptesBancaires.length === 0 && (
                <p className="text-xs text-orange-600 mt-1">Aucun compte bancaire actif n’est disponible.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Référence <span className="text-gray-400">(facultatif)</span>
            </label>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="N° reçu, virement…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || ressourceManquante}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 bg-blue-700 hover:bg-blue-800"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <><CheckCircle2 size={15} /> Régler les frais</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Validation ────────────────────────────────────────────────────────

const MODES_CARBURANT = [
  { value: "especes",      label: "Espèces" },
  { value: "cheque",       label: "Chèque" },
  { value: "virement",     label: "Virement bancaire" },
  { value: "orange_money", label: "Orange Money" },
  { value: "mtn_momo",     label: "MTN MoMo" },
  { value: "wave",         label: "Wave" },
];

function ModalValidation({
  paiement,
  onClose,
  onConfirm,
  loading,
  sessionCaisseOuverte,
  isDelegue,
}: {
  paiement: PaiementListItem;
  onClose: () => void;
  onConfirm: (ref: string, telephone: string, montant: number, mode?: string, ventilations?: VentilationPaiementInput[], cheque?: { numero: string; banque: string }, inclureFraisCollecte?: boolean) => void;
  loading: boolean;
  sessionCaisseOuverte?: boolean | null;
  isDelegue?: boolean;
}) {
  const [ref, setRef] = useState("");
  const [telephone, setTelephone] = useState(telProducteur(paiement) ?? "");
  const [touched, setTouched] = useState(false);
  const montantNet = paiement.montantNetFcfa ?? paiement.montantFcfa;
  const estLivraisonAvecSolde = livraisonAvecSolde(paiement);
  const montantRestant = montantRestantLivraison(paiement);
  const montantDejaPaye = Math.max(0, montantNet - montantRestant);
  const commissionCollecteMontant = paiement.commissionCollecteStatut === "en_attente"
    ? Math.max(0, paiement.commissionCollecteFcfa ?? 0)
    : 0;
  const commissionCollecteDisponible = !!paiement.commissionCollecteId && commissionCollecteMontant > 0;
  const [inclureFraisCollecte, setInclureFraisCollecte] = useState(false);
  const [montantVersementSaisi, setMontantVersementSaisi] = useState(formatMontantSaisi(montantRestant));
  const montantVersement = parseMontantSaisi(montantVersementSaisi);
  const montantTotalAttendu = montantVersement;
  const [multiMoyens, setMultiMoyens] = useState(false);
  const [numeroCheque, setNumeroCheque] = useState("");
  const [banque, setBanque] = useState("");
  const [ventilations, setVentilations] = useState<Array<{
    modePaiement: VentilationPaiementInput["modePaiement"];
    montantFcfa: string;
    numeroCheque: string;
    banque: string;
    dateEcheance: string;
  }>>([
    { modePaiement: "especes", montantFcfa: formatMontantSaisi(montantRestant), numeroCheque: "", banque: "", dateEcheance: "" },
    { modePaiement: "cheque", montantFcfa: "0", numeroCheque: "", banque: "", dateEcheance: "" },
  ]);
  const isCarburant = isBonCarburant(paiement);
  // Pré-remplir avec le mode déjà fixé sur le paiement (livraisons normales)
  // Pour les bons carburant ou les paiements sans mode, laisser la sélection libre
  const modePreset = !isCarburant && !estLivraisonAvecSolde && paiement.modePaiement ? paiement.modePaiement : null;
  const initialMode = modePreset ?? (isDelegue ? "especes" : "");
  const [selectedMode, setSelectedMode] = useState<string>(initialMode);
  // Modes available in the selector depend on role
  const modesDisponibles = isDelegue
    ? MODES_CARBURANT.filter((m) => m.value === "especes")
    : MODES_CARBURANT;
  const modeManquant = !selectedMode;
  const isMobile = selectedMode === "orange_money" || selectedMode === "mtn_momo" || selectedMode === "wave";
  const isEspeces = selectedMode === "especes";
  const sessionBloquee = isEspeces && sessionCaisseOuverte === false;
  const refManquante = isMobile && !ref.trim();
  const totalVentile = ventilations.reduce((total, ligne) => total + parseMontantSaisi(ligne.montantFcfa), 0);
  const ventilationIncorrecte = multiMoyens && totalVentile !== montantTotalAttendu;
  const ventilationEspecesBloquee = multiMoyens
    && ventilations.some((ligne) => ligne.modePaiement === "especes")
    && sessionCaisseOuverte === false;

  function updateMontantVentilation(index: number, value: string) {
    const montant = parseMontantSaisi(value);
    const valeurFormatee = formatMontantSaisi(value);
    setVentilations((old) => {
      const next = old.map((item, i) => i === index
        ? { ...item, montantFcfa: valeurFormatee }
        : item);

      // Le second moyen absorbe automatiquement le solde dans le cas
      // courant espèces + chèque.
      if (old.length === 2) {
        const autreIndex = index === 0 ? 1 : 0;
        next[autreIndex] = {
          ...next[autreIndex],
           montantFcfa: formatMontantSaisi(Math.max(montantVersement - montant, 0)),
        };
      }
      return next;
    });
  }

  function updateMontantVersement(value: string) {
    if (inclureFraisCollecte) return;
    setMontantVersementSaisi(formatMontantSaisi(value));
    const montant = parseMontantSaisi(value);
    setVentilations((old) => old.length === 2
      ? old.map((item, index) => ({
          ...item,
          montantFcfa: formatMontantSaisi(index === 0 ? montant : 0),
        }))
      : old);
  }

  function choisirOptionFraisCollecte(inclure: boolean) {
    setInclureFraisCollecte(inclure);
    // Le versement producteur reste toujours le solde net cacao
    // (déjà diminué des avances, du carburant et des autres charges).
    // La commission est ajoutée séparément au total décaissé.
    setMontantVersementSaisi(formatMontantSaisi(montantRestant));
    setVentilations((old) => old.length === 2
      ? old.map((item, index) => ({
          ...item,
          montantFcfa: formatMontantSaisi(index === 0
            ? montantRestant
            : 0),
        }))
      : old);
    setTouched(false);
  }

  function handleConfirm() {
    const montantBase = inclureFraisCollecte ? montantRestant : montantVersement;
    const montantAControler = inclureFraisCollecte ? montantRestant : montantVersement;
    if (!Number.isSafeInteger(montantAControler) || montantAControler <= 0 || montantAControler > montantRestant) {
      setTouched(true);
      return;
    }
    if (inclureFraisCollecte && montantVersement !== montantRestant) {
      setTouched(true);
      return;
    }
    if (multiMoyens) {
      if (ventilationIncorrecte || ventilations.some((ligne) => {
        const montant = parseMontantSaisi(ligne.montantFcfa);
        return !Number.isInteger(montant) || montant <= 0;
      })) {
        setTouched(true);
        return;
      }
      onConfirm("", "", montantBase, undefined, ventilations.map((ligne) => ({
        modePaiement: ligne.modePaiement,
        montantFcfa: parseMontantSaisi(ligne.montantFcfa),
        ...(ligne.modePaiement === "cheque" ? {
          numeroCheque: ligne.numeroCheque || null,
          banque: ligne.banque || null,
          dateEcheance: ligne.dateEcheance || null,
        } : {}),
      })));
      return;
    }
    if (modeManquant) { setTouched(true); return; }
    if (sessionBloquee) return;
    if (refManquante) { setTouched(true); return; }
    onConfirm(ref, telephone, montantBase, selectedMode || undefined, undefined, { numero: numeroCheque, banque }, inclureFraisCollecte);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        <div className="p-6 space-y-4 overflow-y-auto min-h-0 overscroll-contain">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#e8f5ee" }}>
              <CreditCard size={18} style={{ color: "#1a4731" }} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">
                {estLivraisonAvecSolde && montantDejaPaye > 0 ? "Régler le solde" : "Confirmer le paiement"}
              </h3>
              <p className="text-xs text-gray-500">{nomProducteur(paiement)}</p>
            </div>
            <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Montant brut</span>
              <span className="text-gray-700">{fmt(paiement.montantBrutFcfa)}</span>
            </div>
            {(paiement.avanceDeduiteFcfa ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Avance déduite</span>
                <span className="text-red-600">− {fmt(paiement.avanceDeduiteFcfa)}</span>
              </div>
            )}
            {(paiement.intrantsDeduitsFcfa ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Intrants déduits</span>
                <span className="text-red-600">− {fmt(paiement.intrantsDeduitsFcfa)}</span>
              </div>
            )}
            {(paiement.fraisCarburantDeduitsFcfa ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Carburant déduit</span>
                <span className="text-red-600">− {fmt(paiement.fraisCarburantDeduitsFcfa)}</span>
              </div>
            )}
            {(paiement.autresChargesDeduitesFcfa ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Autres charges déduites</span>
                <span className="text-red-600">− {fmt(paiement.autresChargesDeduitesFcfa)}</span>
              </div>
            )}
            {estLivraisonAvecSolde && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total livraison</span>
                  <span className="text-gray-700">{fmt(montantNet)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Déjà versé</span>
                  <span className="text-green-700">{fmt(montantDejaPaye)}</span>
                </div>
              </>
            )}
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="font-semibold text-gray-700">{estLivraisonAvecSolde ? "Solde net cacao" : "Net à payer"}</span>
              <span className="text-xl font-bold" style={{ color: "#1a4731" }}>{fmt(estLivraisonAvecSolde ? montantRestant : montantNet)}</span>
            </div>
            {commissionCollecteDisponible && (
              <>
                <div className="flex justify-between text-blue-700">
                  <span>Frais de collecte en attente</span>
                  <span className="font-semibold">+ {fmt(commissionCollecteMontant)}</span>
                </div>
                {inclureFraisCollecte && (
                  <div className="border-t pt-2 flex justify-between font-bold text-blue-800">
                    <span>Total à décaisser</span>
                    <span>{fmt(montantVersement + commissionCollecteMontant)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {commissionCollecteDisponible && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-900">Commission de collecte</p>
              <label className="flex items-start gap-2 text-xs text-blue-900 cursor-pointer">
                <input
                  type="radio"
                  name={`frais-collecte-${paiement.id}`}
                  checked={!inclureFraisCollecte}
                  onChange={() => choisirOptionFraisCollecte(false)}
                  className="mt-0.5 accent-blue-700"
                />
                <span>
                  <span className="font-semibold">Payer uniquement le net cacao</span>
                  <span className="block text-blue-700">La commission reste en attente pour un paiement ultérieur.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-blue-900 cursor-pointer">
                <input
                  type="radio"
                  name={`frais-collecte-${paiement.id}`}
                  checked={inclureFraisCollecte}
                  onChange={() => choisirOptionFraisCollecte(true)}
                  className="mt-0.5 accent-blue-700"
                />
                <span>
                  <span className="font-semibold">Tout payer maintenant</span>
                  <span className="block text-blue-700">Net cacao + {fmt(commissionCollecteMontant)} FCFA de frais de collecte.</span>
                </span>
              </label>
            </div>
          )}

          {estLivraisonAvecSolde && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Montant de ce versement <span className="text-red-500 font-semibold">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={montantVersementSaisi}
                onChange={(e) => updateMontantVersement(e.target.value)}
                disabled={inclureFraisCollecte}
                className={`w-full border rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-1 ${
                  touched && (montantVersement <= 0 || montantVersement > montantRestant)
                    ? "border-red-400 bg-red-50 focus:ring-red-400"
                    : "border-gray-200 focus:ring-green-400"
                }`}
              />
              <p className="text-xs text-gray-400 mt-1">
                {inclureFraisCollecte
                  ? `Le net cacao est réglé intégralement, avec ${fmt(commissionCollecteMontant)} FCFA de frais de collecte.`
                  : `Entre 1 et ${fmt(montantRestant)}. Le reliquat sera conservé pour un prochain versement.`}
              </p>
              {touched && (montantVersement <= 0 || montantVersement > montantRestant) && (
                <p className="text-xs text-red-500 mt-1">Le montant doit être positif et ne pas dépasser le solde restant.</p>
              )}
            </div>
          )}

          {/* Mode de règlement */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Mode de paiement
              {!isDelegue && !modePreset && <span className="text-red-500 font-semibold ml-1">*</span>}
            </label>
            {!isDelegue && (
              <label className="flex items-center gap-2 mb-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={multiMoyens}
                  onChange={(e) => { setMultiMoyens(e.target.checked); setTouched(false); }}
                  className="accent-green-700"
                />
                Répartir entre plusieurs moyens
              </label>
            )}
            {multiMoyens ? (
              <div className="space-y-2">
                {ventilations.map((ligne, index) => (
                  <div key={index} className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={ligne.modePaiement}
                        onChange={(e) => setVentilations((old) => old.map((item, i) => i === index ? { ...item, modePaiement: e.target.value as VentilationPaiementInput["modePaiement"] } : item))}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-xs"
                      >
                        {MODES_CARBURANT.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <input
                        type="text"
                        inputMode="numeric"
                        min="1"
                        value={ligne.montantFcfa}
                        onChange={(e) => updateMontantVentilation(index, e.target.value)}
                        className="w-32 border border-gray-200 rounded-lg px-2 py-2 text-xs text-right"
                        placeholder="Montant"
                      />
                      {ventilations.length > 2 && (
                        <button type="button" onClick={() => setVentilations((old) => old.filter((_, i) => i !== index))} className="text-gray-400 hover:text-red-500">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {ligne.modePaiement === "cheque" && (
                      <div className="grid grid-cols-2 gap-2">
                        <input value={ligne.numeroCheque} onChange={(e) => setVentilations((old) => old.map((item, i) => i === index ? { ...item, numeroCheque: e.target.value } : item))} placeholder="N° du chèque" className="border border-gray-200 rounded-lg px-2 py-2 text-xs" />
                        <input value={ligne.banque} onChange={(e) => setVentilations((old) => old.map((item, i) => i === index ? { ...item, banque: e.target.value } : item))} placeholder="Banque (optionnel)" className="border border-gray-200 rounded-lg px-2 py-2 text-xs" />
                      </div>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setVentilations((old) => [...old, { modePaiement: "cheque", montantFcfa: "0", numeroCheque: "", banque: "", dateEcheance: "" }])} className="text-xs font-medium text-green-700 hover:text-green-800">
                  + Ajouter un moyen
                </button>
                <div className={`flex justify-between text-xs font-semibold px-1 ${ventilationIncorrecte ? "text-red-600" : "text-green-700"}`}>
                  <span>Total ventilé</span>
                  <span>{fmt(totalVentile)} / {fmt(montantVersement)}</span>
                </div>
                {touched && ventilationIncorrecte && <p className="text-xs text-red-500">Le total des moyens doit correspondre au montant de ce versement.</p>}
              </div>
            ) : modePreset ? (
              /* Mode pré-sélectionné — lecture seule */
              <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {MODES_CARBURANT.find((m) => m.value === modePreset)?.label ?? modePreset}
              </div>
            ) : (
              <select
                value={selectedMode}
                onChange={(e) => { setSelectedMode(e.target.value); setRef(""); setTouched(false); }}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 bg-white ${
                  touched && modeManquant
                    ? "border-red-400 focus:ring-red-400 bg-red-50"
                    : "border-gray-200 focus:ring-green-400"
                }`}
              >
                {!isDelegue && <option value="">— Choisir le mode de paiement —</option>}
                {modesDisponibles.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            )}
            {touched && modeManquant && (
              <p className="text-xs text-red-500 mt-1">Veuillez choisir un mode de paiement.</p>
            )}
            {paiement.dateLivraison && (
              <p className="text-xs text-gray-400 mt-1">Livr. {paiement.dateLivraison}</p>
            )}
          </div>

          {/* Bandeau bloquant — aucune session de caisse ouverte */}
          {sessionBloquee && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Caisse non ouverte</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Aucune session de caisse n'est ouverte aujourd'hui. Ouvrez une session dans la page{" "}
                  <span className="font-semibold">Caisse</span> avant de valider un règlement en espèces.
                </p>
              </div>
            </div>
          )}

          {isMobile && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Numéro Mobile Money
              </label>
              <input
                type="tel"
                inputMode="tel"
                minLength={10} maxLength={10} pattern="[0-9]{10}"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="07 XX XX XX XX"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </div>
          )}

          {!multiMoyens && selectedMode === "cheque" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                value={numeroCheque}
                onChange={(e) => setNumeroCheque(e.target.value)}
                placeholder="N° du chèque"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
              />
              <input
                value={banque}
                onChange={(e) => setBanque(e.target.value)}
                placeholder="Banque (optionnel)"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Référence transaction{" "}
              {isMobile
                ? <span className="text-red-500 font-semibold">*obligatoire</span>
                : <span className="text-gray-400">(optionnel)</span>}
            </label>
            <input
              type="text"
              value={ref}
              onChange={(e) => { setRef(e.target.value); setTouched(false); }}
              placeholder={isMobile
                ? selectedMode === "orange_money" ? "Ex: OM-2025-00123"
                  : selectedMode === "mtn_momo" ? "Ex: MTN-2025-00456"
                  : "Ex: WAVE-2025-00789"
                : "Ex: REF-00123"}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                touched && refManquante
                  ? "border-red-400 focus:ring-red-400 bg-red-50"
                  : "border-gray-200 focus:ring-green-400"
              }`}
            />
            {touched && refManquante && (
              <p className="text-xs text-red-500 mt-1">
                La référence de transaction est obligatoire pour un paiement mobile money.
              </p>
            )}
          </div>

        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-100 bg-white shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || (multiMoyens ? ventilationEspecesBloquee : sessionBloquee || modeManquant)}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: (multiMoyens ? ventilationEspecesBloquee : sessionBloquee || modeManquant) ? "#9ca3af" : "#1a4731" }}
          >
            {loading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={15} />
                Confirmer et payer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Rejet ─────────────────────────────────────────────────────────────

const MOTIFS_RAPIDES = [
  "Montant incorrect",
  "Livraison non vérifiée",
  "Avance non soldée",
  "Autre",
];

function ModalRejet({
  paiement,
  onClose,
  onConfirm,
  loading,
}: {
  paiement: PaiementListItem;
  onClose: () => void;
  onConfirm: (motif: string) => void;
  loading: boolean;
}) {
  const [motif, setMotif] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <XCircle size={18} className="text-red-500" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Rejeter le paiement</h3>
              <p className="text-xs text-gray-500">{nomProducteur(paiement)} · {fmt(paiement.montantNetFcfa ?? paiement.montantFcfa)}</p>
            </div>
            <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Suggestions rapides</p>
            <div className="flex flex-wrap gap-2">
              {MOTIFS_RAPIDES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMotif(m)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    motif === m
                      ? "border-red-300 bg-red-50 text-red-700 font-medium"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Motif du rejet <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Précisez le motif de rejet…"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={() => onConfirm(motif)}
              disabled={loading || !motif.trim()}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <>
                  <XCircle size={15} />
                  Confirmer le rejet
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Reçu ──────────────────────────────────────────────────────────────

function ModalRecu({ paiement, onClose }: { paiement: PaiementListItem; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  async function handlePrintPdf() {
    setPrintError(null);
    // Ouvrir la fenêtre avant l'appel réseau évite que le navigateur bloque le popup.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setPrintError("L'impression nécessite d'autoriser les fenêtres pop-up pour ce site.");
      return;
    }

    setPrinting(true);
    try {
      printWindow.document.title = "Préparation du reçu…";
      printWindow.document.body.innerHTML = "<p style=\"font-family:sans-serif;padding:2rem\">Préparation du reçu…</p>";
      const res = await fetch(`${BASE}/api/rapports/recu/paiement/${paiement.id}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      let printed = false;
      const print = () => {
        if (printed) return;
        printed = true;
        printWindow.focus();
        printWindow.print();
      };
      printWindow.addEventListener("load", print, { once: true });
      printWindow.location.href = url;
      // Certains lecteurs PDF ne propagent pas l'événement load à la fenêtre.
      window.setTimeout(print, 1500);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      printWindow.close();
      setPrintError("Impossible de préparer le reçu pour l'impression.");
    } finally {
      setPrinting(false);
    }
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`${BASE}/api/rapports/recu/paiement/${paiement.id}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recu_paiement_${paiement.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } catch {}
    finally { setDownloading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                <Receipt size={18} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Reçu de paiement</h3>
                <p className="text-xs text-gray-500">CoopDigital</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 text-sm">
            <div className="px-4 py-2.5 flex justify-between">
              <span className="text-gray-500 flex items-center gap-1.5"><User size={12} /> Producteur</span>
              <span className="font-medium text-gray-900">{nomProducteur(paiement)}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="text-gray-500 flex items-center gap-1.5"><Package size={12} /> Poids net</span>
              <span className="font-medium text-gray-900">{fmtPoids(paiement.poidsNetKg ?? paiement.poidsKg)}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="text-gray-500 flex items-center gap-1.5"><Calendar size={12} /> Livraison</span>
              <span className="font-medium text-gray-900">{paiement.dateLivraison ?? "—"}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between">
              <span className="text-gray-500">Mode</span>
              {paiement.lignes && paiement.lignes.length > 1 ? (
                <div className="flex flex-wrap justify-end gap-1">
                  {paiement.lignes.map((ligne) => (
                    <span key={ligne.id} className="text-xs text-gray-700">{MODE_CONFIG[ligne.modePaiement]?.label ?? ligne.modePaiement} : {fmt(ligne.montantFcfa)}</span>
                  ))}
                </div>
              ) : (
                <ModeBadge
                  mode={paiement.modePaiement ?? (paiement.lignes?.length === 1 ? paiement.lignes[0]?.modePaiement : null)}
                  statut={paiement.statut}
                />
              )}
            </div>
            {paiement.referenceTransaction && (
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-gray-500">Référence</span>
                <span className="font-medium text-gray-900 font-mono text-xs">{paiement.referenceTransaction}</span>
              </div>
            )}
            <div className="px-4 py-3 flex justify-between items-center bg-green-50 rounded-b-xl">
              <span className="font-semibold text-gray-700">Montant payé</span>
              <span className="text-xl font-bold text-green-700">{fmt(paiement.montantFcfa)}</span>
            </div>
            {livraisonAvecSolde(paiement) && (
              <div className="px-4 py-2.5 flex justify-between text-xs">
                <span className="text-gray-500">Solde livraison après ce versement</span>
                <span className="font-semibold text-blue-700">{fmt(paiement.livraisonMontantRestant)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Validé le {paiement.dateValidation ? new Date(paiement.dateValidation).toLocaleDateString("fr-FR") : "—"}</span>
            <StatutBadge statut={paiement.statut} />
          </div>

          {printError && <p className="text-xs text-red-600">{printError}</p>}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 min-w-0 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Fermer
            </button>
            <button
              onClick={handlePrintPdf}
              disabled={printing}
              className="flex-1 min-w-0 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ backgroundColor: "#1a4731" }}
            >
              {printing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  <Printer size={14} />
                  Imprimer
                </>
              )}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex-1 min-w-0 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5 hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <><FileDown size={14} /> Télécharger</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────

type ModalState =
  | { type: "valider"; paiement: PaiementListItem }
  | { type: "rejeter"; paiement: PaiementListItem }
  | { type: "recu"; paiement: PaiementListItem }
  | null;

export default function ReglementsPage() {
  const peutLire = usePermission("paiements", "lire");
  const peutValider = usePermission("paiements", "valider");
  const peutRejeter = usePermission("paiements", "rejeter");
  const { utilisateur } = useAuth();
  const isDelegue = utilisateur?.role === "delegue";

  const [filtreStatut, setFiltreStatut] = useState<string>("en_attente");
  const [filtrePeriode, setFiltrePeriode] = useState<string>("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [filtreSansMode, setFiltreSansMode] = useState(false);
  const [filtreProxy, setFiltreProxy] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [transportModal, setTransportModal] = useState<FraisTransportARegler | null>(null);

  const qc = useQueryClient();
  const { toast } = useToast();

  // Solde caisse délégué (visible seulement pour le rôle délégué)
  // On passe par /api/caisse qui filtre automatiquement sur responsable_id pour le rôle délégué
  const { data: caissesData } = useQuery<Array<{ solde_actuel_fcfa: string; fond_caisse_minimum_fcfa: string; session_statut: string | null }>>({
    queryKey: ["caisse-delegue-solde", utilisateur?.id],
    queryFn: () => apiFetch(`/api/caisse`),
    enabled: isDelegue && !!utilisateur?.id,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const caisseDelegue = caissesData?.[0]
    ? { caisse: { solde: parseFloat(caissesData[0].solde_actuel_fcfa), plafond: null } }
    : undefined;
  const sessionDelegueOuverte = caissesData?.[0] != null
    ? caissesData[0].session_statut === "ouverte"
    : null;

  // Session Caisse Centrale (visible pour les rôles non-délégué — Directeur, PCA, Comptable)
  const { data: caissesNonDelegueData } = useQuery<Array<{
    type_caisse: string; nom: string;
    solde_actuel_fcfa: string;
    session_id: number | null; session_statut: string | null;
  }>>({
    queryKey: ["caisse-centrale-session"],
    queryFn: () => apiFetch(`/api/caisse`),
    enabled: !isDelegue && peutValider,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const caisseCentrale = caissesNonDelegueData?.find((c) => c.type_caisse === "centrale");
  const sessionCentraleOuverte = caisseCentrale
    ? caisseCentrale.session_statut === "ouverte"
    : null;
  const soldeCaisseCentrale = caisseCentrale
    ? parseFloat(caisseCentrale.solde_actuel_fcfa)
    : null;

  // Liste
  const periodePersonnalisee = filtrePeriode === "custom";
  const periodePersonnaliseeValide = !periodePersonnalisee
    || (!!dateDebut && !!dateFin && dateDebut <= dateFin);
  const params = {
    statut: filtreStatut ? (filtreStatut as ListPaiementsStatut) : undefined,
    periode: filtrePeriode && !periodePersonnalisee
      ? (filtrePeriode as ListPaiementsPeriode)
      : undefined,
    date_debut: periodePersonnalisee && dateDebut ? dateDebut : undefined,
    date_fin: periodePersonnalisee && dateFin ? dateFin : undefined,
    limit: 200,
  };
  const statsParams = {
    periode: filtrePeriode && !periodePersonnalisee
      ? (filtrePeriode as GetPaiementsStatsPeriode)
      : undefined,
    date_debut: periodePersonnalisee && dateDebut ? dateDebut : undefined,
    date_fin: periodePersonnalisee && dateFin ? dateFin : undefined,
  };
  const { data: stats } = useGetPaiementsStats(statsParams, {
    query: {
      queryKey: getGetPaiementsStatsQueryKey(statsParams),
      refetchInterval: 30_000,
      enabled: periodePersonnaliseeValide,
    },
  });
  const { data: paiements, isLoading } = useListPaiements(params, {
    query: {
      queryKey: getListPaiementsQueryKey(params),
      enabled: periodePersonnaliseeValide,
    },
  });

  const {
    data: fraisTransport = [],
    isLoading: fraisTransportLoading,
    isError: fraisTransportError,
    error: fraisTransportErreur,
    refetch: rechargerFraisTransport,
  } = useQuery<FraisTransportARegler[]>({
    queryKey: ["frais-transport-a-regler"],
    queryFn: () => apiFetchChecked<FraisTransportARegler[]>("/api/expeditions/frais-transport-a-regler"),
    enabled: peutLire,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: caissesTransport = [] } = useQuery<CaisseTransport[]>({
    queryKey: ["caisses-reglement-exportation"],
    queryFn: () => apiFetchChecked<CaisseTransport[]>("/api/caisse"),
    enabled: peutValider && !!transportModal,
    staleTime: 30_000,
  });
  const { data: comptesBancairesTransport = [] } = useQuery<CompteBancaireTransport[]>({
    queryKey: ["comptes-bancaires-reglement-exportation"],
    queryFn: () => apiFetchChecked<CompteBancaireTransport[]>("/api/banque"),
    enabled: peutValider && !isDelegue && !!transportModal,
    staleTime: 30_000,
  });

  const validerMut = useValiderPaiement();
  const rejeterMut = useRejeterPaiement();
  const reglementTransportMut = useMutation({
    mutationFn: (input: {
      expeditionId: number;
      modePaiement: "especes" | "banque";
      caisseId?: number;
      compteBancaireId?: number;
      reference?: string;
    }) => apiPostChecked(`/api/expeditions/${input.expeditionId}/reglement-frais-transport`, {
      modePaiement: input.modePaiement,
      caisseId: input.caisseId,
      compteBancaireId: input.compteBancaireId,
      reference: input.reference,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["frais-transport-a-regler"] });
      void qc.invalidateQueries({ queryKey: ["expeditions"] });
      void qc.invalidateQueries({ queryKey: ["expeditions-stats"] });
      void qc.invalidateQueries({ queryKey: ["caisses-reglement-exportation"] });
      void qc.invalidateQueries({ queryKey: ["comptes-bancaires-reglement-exportation"] });
      void qc.invalidateQueries({ queryKey: ["caisse-centrale-session"] });
      if (isDelegue) {
        void qc.invalidateQueries({ queryKey: ["caisse-delegue-solde", utilisateur?.id] });
      }
      setTransportModal(null);
      toast({
        title: "Frais d’exportation réglés",
        description: "La trésorerie et la comptabilité ont été mises à jour.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Règlement impossible", description: err.message, variant: "destructive" });
    },
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["listPaiements"] });
    qc.invalidateQueries({ queryKey: ["getPaiementsStats"] });
    for (const s of ["en_attente", "confirme", "rejete", "en_cours", "effectue", "echec", ""]) {
      qc.invalidateQueries({ queryKey: getListPaiementsQueryKey({ statut: s as ListPaiementsStatut }) });
    }
    qc.invalidateQueries({ queryKey: getGetPaiementsStatsQueryKey() });
  }

  async function handleValider(
    ref: string,
    telephone: string,
    montant: number,
    mode?: ValiderPaiementInputModePaiement,
    ventilations?: VentilationPaiementInput[],
    cheque?: { numero: string; banque: string },
    inclureFraisCollecte = false,
  ) {
    if (modal?.type !== "valider") return;
    // Le mode peut aussi être choisi pour chaque versement d'une livraison différée.
    const hasPresetMode = !!modal.paiement.modePaiement;
    const isCarburant = isBonCarburant(modal.paiement);
    const sendMode = mode && (!hasPresetMode || isCarburant || livraisonAvecSolde(modal.paiement));
    try {
      await validerMut.mutateAsync({
        id: modal.paiement.id,
        data: {
          referenceTransaction: ref || null,
          telephone: telephone || null,
          ...(livraisonAvecSolde(modal.paiement) ? { montantReglementFcfa: montant } : {}),
          ...(inclureFraisCollecte ? { inclureFraisCollecte: true } : {}),
          ...(sendMode ? { modePaiement: mode } : {}),
          ...(cheque && mode === "cheque" ? {
            numeroCheque: cheque.numero || null,
            banque: cheque.banque || null,
          } : {}),
          ...(ventilations ? { ventilations } : {}),
        },
      });
      invalidateAll();
      // Rafraîchir le solde caisse délégué après validation espèces
      const modeEffectif = mode ?? modal.paiement.modePaiement;
      const contientEspeces = ventilations?.some((ligne) => ligne.modePaiement === "especes") || modeEffectif === "especes";
      if (isDelegue && contientEspeces) {
        qc.invalidateQueries({ queryKey: ["caisse-delegue-solde", utilisateur?.id] });
      }
      // Rafraîchir le statut session Caisse Centrale après validation
      if (!isDelegue && contientEspeces) {
        qc.invalidateQueries({ queryKey: ["caisse-centrale-session"] });
      }
      setModal(null);
      toast({ title: "Paiement validé", description: "Le producteur a été notifié." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Impossible de valider le paiement";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  }

  async function handleRejeter(motif: string) {
    if (modal?.type !== "rejeter") return;
    try {
      await rejeterMut.mutateAsync({
        id: modal.paiement.id,
        data: { motifRejet: motif },
      });
      invalidateAll();
      setModal(null);
      toast({ title: "Paiement rejeté", description: `Motif : ${motif}` });
    } catch {
      toast({ title: "Erreur", description: "Impossible de rejeter le paiement", variant: "destructive" });
    }
  }

  const filtres = (paiements ?? []).filter((p) => {
    if (filtreSansMode && !!p.modePaiement) return false;
    if (filtreProxy && !p.agentSaisiseurId) return false;
    if (!recherche) return true;
    const r = recherche.toLowerCase();
    return (
      nomProducteur(p).toLowerCase().includes(r) ||
      (telProducteur(p) ?? "").includes(r) ||
      (p.bonCarburantNumero ?? "").toLowerCase().includes(r)
    );
  });

  const FILTRES_STATUT = [
    { value: "en_attente", label: "En attente" },
    { value: "confirme",   label: "Confirmés" },
    { value: "effectue",   label: "Effectués" },
    { value: "en_cours",   label: "En cours" },
    { value: "rejete",     label: "Rejetés" },
    { value: "echec",      label: "Échec" },
    { value: "",           label: "Tous" },
  ];

  const FILTRES_PERIODE = [
    { value: "",               label: "Toutes dates" },
    { value: "today",          label: "Aujourd'hui" },
    { value: "week",           label: "Cette semaine" },
    { value: "month",          label: "Ce mois" },
    { value: "previous_month", label: "Mois précédent" },
    { value: "campaign",       label: "Toute la campagne" },
    { value: "custom",         label: "Période personnalisée" },
  ];
  const libellePaiementsPeriode = filtrePeriode === "today"
    ? "Payés aujourd’hui"
    : filtrePeriode === "week"
      ? "Payés cette semaine"
      : filtrePeriode === "month"
        ? "Payés ce mois"
        : filtrePeriode === "previous_month"
          ? "Payés le mois précédent"
          : filtrePeriode === "campaign"
            ? "Payés — toute la campagne"
            : filtrePeriode === "custom"
              ? "Payés — période choisie"
              : "Payés — toutes dates";

  // Calcul alerte solde : si le plus petit paiement en attente > solde
  const paiementsEnAttente = (paiements ?? []).filter(
    (p) => p.statut === "en_attente" && montantEspeces(p) > 0,
  );
  const plusPetitMontant = paiementsEnAttente.length > 0
    ? Math.min(...paiementsEnAttente.map((p) => montantEspeces(p)))
    : null;
  const totalEspecesEnAttente = paiementsEnAttente.reduce(
    (acc, p) => acc + montantEspeces(p), 0,
  );
  const soldeCaisse = caisseDelegue?.caisse?.solde ?? null;
  const alerteSolde = isDelegue && soldeCaisse !== null && plusPetitMontant !== null && soldeCaisse < plusPetitMontant;
  const soldeSuffisant = isDelegue && soldeCaisse !== null && plusPetitMontant !== null && soldeCaisse >= plusPetitMontant;
  // Alerte solde Caisse Centrale insuffisant (non-délégué)
  const alerteSoldeCentrale = !isDelegue && sessionCentraleOuverte === true
    && soldeCaisseCentrale !== null && plusPetitMontant !== null
    && soldeCaisseCentrale < plusPetitMontant;
  const soldeCentraleSuffisant = !isDelegue && sessionCentraleOuverte === true
    && soldeCaisseCentrale !== null
    && (plusPetitMontant === null || soldeCaisseCentrale >= plusPetitMontant);

  return (
    <div className="space-y-5">
      {/* ── En-tête ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Règlements</h1>
        <p className="text-gray-500 text-sm mt-0.5">Validation des paiements producteurs</p>
      </div>

      {/* ── Carte solde caisse (délégué uniquement) ── */}
      {isDelegue && (
        <div
          className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${
            alerteSolde
              ? "bg-red-50 border-red-200"
              : soldeSuffisant
              ? "bg-green-50 border-green-200"
              : "bg-white border-gray-200"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              alerteSolde ? "bg-red-100" : soldeSuffisant ? "bg-green-100" : "bg-gray-100"
            }`}
          >
            <Wallet
              size={18}
              className={alerteSolde ? "text-red-600" : soldeSuffisant ? "text-green-700" : "text-gray-500"}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium">Solde de votre caisse</p>
            {soldeCaisse === null ? (
              <p className="text-sm text-gray-400">Chargement…</p>
            ) : (
              <p className={`text-xl font-bold ${alerteSolde ? "text-red-700" : "text-gray-900"}`}>
                {new Intl.NumberFormat("fr-FR").format(soldeCaisse)}{" "}
                <span className="text-sm font-normal text-gray-500">FCFA</span>
              </p>
            )}
            {caisseDelegue?.caisse?.plafond != null && (
              <p className="text-xs text-gray-400 mt-0.5">
                Plafond : {new Intl.NumberFormat("fr-FR").format(caisseDelegue.caisse.plafond)} FCFA
              </p>
            )}
          </div>
          {alerteSolde && (
            <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium flex-shrink-0">
              <AlertTriangle size={14} />
              <span>Fonds insuffisants</span>
            </div>
          )}
          {soldeSuffisant && !alerteSolde && (
            <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium flex-shrink-0">
              <CheckCircle2 size={14} />
              <span>Fonds disponibles</span>
            </div>
          )}
        </div>
      )}

      {/* ── Caisse Centrale : session fermée (alerte ambre) ── */}
      {!isDelegue && peutValider && caisseCentrale && sessionCentraleOuverte === false && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5">
          <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle size={16} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              Session Caisse Centrale non ouverte
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              La <strong>{caisseCentrale.nom}</strong> n'a pas de session ouverte aujourd'hui.
              Les paiements en espèces pourront être validés, mais le débit automatique de la caisse ne sera pas effectué.
              Ouvrez la session depuis le module <strong>Caisse</strong> pour activer le débit automatique.
            </p>
          </div>
        </div>
      )}

      {/* ── Caisse Centrale : solde temps réel (session ouverte) ── */}
      {!isDelegue && peutValider && caisseCentrale && sessionCentraleOuverte === true && (
        <div
          className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${
            alerteSoldeCentrale
              ? "bg-red-50 border-red-200"
              : soldeCentraleSuffisant
              ? "bg-green-50 border-green-200"
              : "bg-white border-gray-200"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              alerteSoldeCentrale ? "bg-red-100" : soldeCentraleSuffisant ? "bg-green-100" : "bg-gray-100"
            }`}
          >
            <Wallet
              size={18}
              className={alerteSoldeCentrale ? "text-red-600" : soldeCentraleSuffisant ? "text-green-700" : "text-gray-500"}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium">{caisseCentrale.nom} — solde disponible</p>
            <p className={`text-xl font-bold ${alerteSoldeCentrale ? "text-red-700" : "text-gray-900"}`}>
              {new Intl.NumberFormat("fr-FR").format(soldeCaisseCentrale ?? 0)}{" "}
              <span className="text-sm font-normal text-gray-500">FCFA</span>
            </p>
            {paiementsEnAttente.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                Total espèces en attente : {new Intl.NumberFormat("fr-FR").format(totalEspecesEnAttente)} FCFA
                ({paiementsEnAttente.length} paiement{paiementsEnAttente.length > 1 ? "s" : ""})
              </p>
            )}
          </div>
          {alerteSoldeCentrale && (
            <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium flex-shrink-0">
              <AlertTriangle size={14} />
              <span>Fonds insuffisants</span>
            </div>
          )}
          {soldeCentraleSuffisant && !alerteSoldeCentrale && paiementsEnAttente.length > 0 && (
            <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium flex-shrink-0">
              <CheckCircle2 size={14} />
              <span>Fonds disponibles</span>
            </div>
          )}
        </div>
      )}

      {/* ── Bandeau stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Clock size={16} className="text-amber-600" />}
          bg="bg-amber-50"
          label="En attente"
          value={stats ? `${stats.en_attente.count} paiements` : "—"}
          sub={stats ? fmt(stats.en_attente.montant_total) : ""}
          subCls="text-amber-700 font-semibold"
        />
        <StatCard
          icon={<CheckCircle2 size={16} className="text-green-600" />}
          bg="bg-green-50"
          label="Validés aujourd'hui"
          value={stats ? `${stats.valide_aujourd_hui.count} paiements` : "—"}
          sub={stats ? fmt(stats.valide_aujourd_hui.montant_total) : ""}
          subCls="text-green-700 font-semibold"
        />
        <StatCard
          icon={<XCircle size={16} className="text-red-500" />}
          bg="bg-red-50"
          label="Rejetés"
          value={stats ? `${stats.rejete.count}` : "—"}
          sub="total"
          subCls="text-gray-400"
        />
        <StatCard
          icon={<TrendingUp size={16} style={{ color: "#1a4731" }} />}
          bg="bg-emerald-50"
          label={libellePaiementsPeriode}
          value={stats ? fmt(stats.effectue_periode.montant_total) : "—"}
          sub=""
          subCls=""
        />
      </div>

      {/* ── Frais d'exportation ── */}
      {peutLire && (
        <section className="rounded-xl border border-blue-100 bg-blue-50/40 overflow-hidden">
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-blue-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <Ship size={17} className="text-blue-700" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">Frais d’exportation</h2>
                <p className="text-xs text-gray-500">
                  Expéditions réceptionnées à régler
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-blue-800">
                {fraisTransport.reduce((total, expedition) => total + Number(expedition.fraisTransportFcfa), 0).toLocaleString("fr-FR")} FCFA
              </p>
              <p className="text-xs text-gray-500">
                {fraisTransport.length} expédition{fraisTransport.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {fraisTransportLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-blue-300" size={24} />
            </div>
          ) : fraisTransportError ? (
            <div className="flex items-center justify-between gap-3 px-5 py-6 text-sm text-red-700">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                <span>
                  {fraisTransportErreur instanceof Error
                    ? fraisTransportErreur.message
                    : "Impossible de charger les frais d’exportation à régler."}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void rechargerFraisTransport()}
                className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Réessayer
              </button>
            </div>
          ) : fraisTransport.length === 0 ? (
            <div className="px-5 py-7 text-center text-sm text-gray-500">
              Aucun frais d’exportation en attente de règlement.
            </div>
          ) : (
            <div className="divide-y divide-blue-100">
              {fraisTransport.map((expedition) => (
                <FraisTransportRow
                  key={expedition.id}
                  expedition={expedition}
                  peutValider={peutValider}
                  onRegler={() => setTransportModal(expedition)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Filtres ── */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Rechercher par nom ou téléphone…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
        <div className="relative">
          <select
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value)}
            className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400 bg-white"
          >
            {FILTRES_STATUT.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={filtrePeriode}
            onChange={(e) => setFiltrePeriode(e.target.value)}
            className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400 bg-white"
          >
            {FILTRES_PERIODE.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        {periodePersonnalisee && (
          <div className="basis-full grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-green-100 bg-green-50/50 p-3">
            <label className="text-xs font-medium text-gray-600">
              Du
              <input
                type="date"
                value={dateDebut}
                max={dateFin || undefined}
                onChange={(e) => setDateDebut(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Au
              <input
                type="date"
                value={dateFin}
                min={dateDebut || undefined}
                onChange={(e) => setDateFin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </label>
            {!periodePersonnaliseeValide && (
              <p className="sm:col-span-2 text-xs text-amber-700">
                Sélectionnez une date de début et une date de fin valides.
              </p>
            )}
          </div>
        )}
        <button
          onClick={() => setFiltreSansMode((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
            filtreSansMode
              ? "bg-amber-100 border-amber-300 text-amber-800"
              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <AlertCircle size={13} />
          À compléter
          {filtreSansMode && (
            <X size={12} className="ml-0.5 opacity-60" />
          )}
        </button>
        <button
          onClick={() => setFiltreProxy((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
            filtreProxy
              ? "bg-indigo-100 border-indigo-300 text-indigo-800"
              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <User size={13} />
          Proxy gérant
          {filtreProxy && (
            <X size={12} className="ml-0.5 opacity-60" />
          )}
        </button>
      </div>

      {/* ── Liste ── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-gray-300" size={32} />
        </div>
      ) : filtres.length === 0 ? (
        <div className="text-center py-16">
          <CheckCheck size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">Aucun paiement{filtreStatut === "en_attente" ? " en attente" : ""}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtres.map((p) => (
            <PaiementRow
              key={p.id}
              paiement={p}
              peutValider={peutValider}
              peutRejeter={peutRejeter}
              isDelegue={isDelegue}
              onValider={() => setModal({ type: "valider", paiement: p })}
              onRejeter={() => setModal({ type: "rejeter", paiement: p })}
              onRecu={() => setModal({ type: "recu", paiement: p })}
            />
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {modal?.type === "valider" && (
        <ModalValidation
          paiement={modal.paiement}
          onClose={() => setModal(null)}
          onConfirm={(ref, telephone, montant, mode, ventilations, cheque, inclureFraisCollecte) => void handleValider(ref, telephone, montant, mode as ValiderPaiementInputModePaiement | undefined, ventilations, cheque, inclureFraisCollecte)}
          loading={validerMut.isPending}
          sessionCaisseOuverte={isDelegue ? sessionDelegueOuverte : sessionCentraleOuverte}
          isDelegue={isDelegue}
        />
      )}
      {modal?.type === "rejeter" && (
        <ModalRejet
          paiement={modal.paiement}
          onClose={() => setModal(null)}
          onConfirm={handleRejeter}
          loading={rejeterMut.isPending}
        />
      )}
      {modal?.type === "recu" && (
        <ModalRecu
          paiement={modal.paiement}
          onClose={() => setModal(null)}
        />
      )}
      {transportModal && (
        <ModalReglementTransport
          expedition={transportModal}
          caisses={caissesTransport}
          comptesBancaires={comptesBancairesTransport}
          isDelegue={isDelegue}
          onClose={() => {
            if (!reglementTransportMut.isPending) setTransportModal(null);
          }}
          onConfirm={(input) => reglementTransportMut.mutate({
            expeditionId: transportModal.id,
            ...input,
          })}
          loading={reglementTransportMut.isPending}
        />
      )}
    </div>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({
  icon, bg, label, value, sub, subCls,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
  sub: string;
  subCls: string;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg}`}>
          {icon}
        </div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-base font-bold text-gray-900">{value}</p>
      {sub && <p className={`text-xs ${subCls}`}>{sub}</p>}
    </div>
  );
}

// ─── PaiementRow ─────────────────────────────────────────────────────────────

const MODES_MOBILE_MARCHAND = new Set(["orange_money", "mtn_momo", "wave"]);

function PaiementRow({
  paiement: p,
  peutValider,
  peutRejeter,
  isDelegue,
  onValider,
  onRejeter,
  onRecu,
}: {
  paiement: PaiementListItem;
  peutValider: boolean;
  peutRejeter: boolean;
  isDelegue: boolean;
  onValider: () => void;
  onRejeter: () => void;
  onRecu: () => void;
}) {
  const poids = p.poidsNetKg ?? p.poidsKg;
  const montantNet = p.montantNetFcfa ?? p.montantFcfa;
  const montantRestant = montantRestantLivraison(p);
  const montantDejaPaye = Math.max(0, montantNet - montantRestant);
  const showActions = p.statut === "en_attente";
  const showRecu = p.statut === "confirme" || p.statut === "effectue" || p.statut === "en_cours";
  const showRejet = p.statut === "rejete";
  const isSoldePartiel = livraisonAvecSolde(p) && montantDejaPaye > 0;
  const isMobileMarchand = !!p.modePaiement && MODES_MOBILE_MARCHAND.has(p.modePaiement);
  const delegueBloque = isDelegue && isMobileMarchand;
  const isCarburant = isBonCarburant(p);

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        {/* Infos */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {isCarburant && <Fuel size={14} className="text-amber-600 shrink-0" />}
            <p className="font-semibold text-gray-900 text-sm">
              {nomProducteur(p)}
            </p>
            <StatutBadge statut={p.statut} />
            <ModeBadge
              mode={p.modePaiement ?? (p.lignes?.length === 1 ? p.lignes[0]?.modePaiement : null)}
              statut={p.statut}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {!isCarburant && telProducteur(p) && <span>{telProducteur(p)}</span>}
            {!isCarburant && p.dateLivraison && <span>Livr. {p.dateLivraison}</span>}
            {!isCarburant && poids && <span>{fmtPoids(poids)}</span>}
            {isCarburant && <span className="text-amber-600">Bon carburant — règlement station</span>}
          </div>
          {/* Décomposition montants (producteurs uniquement) */}
          {!isCarburant && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs mt-1">
            {p.montantBrutFcfa != null && (
              <span className="text-gray-500">Brut : {fmt(p.montantBrutFcfa)}</span>
            )}
            {(p.avanceDeduiteFcfa ?? 0) > 0 && (
              <span className="text-red-500">− avance {fmt(p.avanceDeduiteFcfa)}</span>
            )}
            {(p.intrantsDeduitsFcfa ?? 0) > 0 && (
              <span className="text-red-500">− intrants {fmt(p.intrantsDeduitsFcfa)}</span>
            )}
            {livraisonAvecSolde(p) && (
              <>
                <span className="text-green-700">Déjà versé : {fmt(montantDejaPaye)}</span>
                <span className={`font-semibold ${isSoldePartiel ? "text-blue-700" : "text-gray-600"}`}>
                  {isSoldePartiel ? "Solde à régler : " : "Reste : "}{fmt(montantRestant)}
                </span>
              </>
            )}
          </div>
          )}
          {/* Proxy gérant */}
          {p.agentSaisiseurId && p.agentSaisiseurNom && (
            <p className="text-xs text-indigo-600 mt-0.5">
              Saisi par <span className="font-medium">{p.agentSaisiseurNom}</span> pour le délégué
            </p>
          )}
          {/* Motif rejet */}
          {showRejet && p.motifRejet && (
            <p className="text-xs text-red-500 italic mt-1">Motif : {p.motifRejet}</p>
          )}
          {/* Info restriction délégué Mobile Marchand */}
          {showActions && delegueBloque && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              <Lock size={11} className="flex-shrink-0" />
              <span>Validation réservée au Directeur, Comptable ou PCA</span>
            </div>
          )}
        </div>

        {/* Montant net + actions */}
        <div className="text-right flex flex-col items-end gap-2 shrink-0">
          <div>
            <span className="font-bold text-gray-900">{fmt(p.montantFcfa)}</span>
            {livraisonAvecSolde(p) && <p className="text-[10px] text-gray-400">ce versement</p>}
          </div>
          <div className="flex items-center gap-1.5">
            {showActions && peutValider && !delegueBloque && (
              <button
                onClick={onValider}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white whitespace-nowrap ${isSoldePartiel ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                style={isSoldePartiel ? undefined : { backgroundColor: "#1a4731" }}
              >
                {isSoldePartiel ? <Banknote size={12} /> : <CheckCircle2 size={12} />}
                {isSoldePartiel ? "Régler le solde" : "Valider"}
              </button>
            )}
            {showActions && peutRejeter && (
              <button
                onClick={onRejeter}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-red-500 hover:bg-red-600"
              >
                <XCircle size={12} />
                Rejeter
              </button>
            )}
            {showRecu && (
              <button
                onClick={onRecu}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                <Receipt size={12} />
                Reçu
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FraisTransportRow({
  expedition,
  peutValider,
  onRegler,
}: {
  expedition: FraisTransportARegler;
  peutValider: boolean;
  onRegler: () => void;
}) {
  const dateReception = expedition.dateArriveePort
    ? new Date(expedition.dateArriveePort).toLocaleDateString("fr-FR")
    : "—";

  return (
    <div className="px-5 py-4 bg-white/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900 text-sm font-mono">{expedition.numeroExpedition}</p>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
              <Clock size={11} /> Non payé
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
            <span>Port de {expedition.port}</span>
            <span>Réception : {dateReception}</span>
            {(expedition.transporteur || expedition.nomChauffeur) && (
              <span>{expedition.transporteur || expedition.nomChauffeur}</span>
            )}
            {expedition.exportateurNom && <span>Exportateur : {expedition.exportateurNom}</span>}
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-2 shrink-0">
          <span className="font-bold text-gray-900">{fmt(Number(expedition.fraisTransportFcfa))}</span>
          {peutValider && (
            <button
              onClick={onRegler}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white whitespace-nowrap bg-blue-700 hover:bg-blue-800"
            >
              <Banknote size={12} />
              Régler les frais
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

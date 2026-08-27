import { useState } from "react";
import {
  CheckCircle2, Clock, XCircle, Loader2, CreditCard, Search,
  CheckCheck, AlertCircle, Banknote, Smartphone, ChevronDown,
  Receipt, Package, User, Calendar, TrendingUp, X, Wallet,
  AlertTriangle, Lock, FileDown, Fuel,
} from "lucide-react";
import {
  useListPaiements,
  useValiderPaiement,
  useRejeterPaiement,
  useGetPaiementsStats,
  ListPaiementsStatut,
  ListPaiementsPeriode,
  type PaiementListItem,
  type ValiderPaiementInputModePaiement,
  type VentilationPaiementInput,
  getListPaiementsQueryKey,
  getGetPaiementsStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

function nomProducteur(p: PaiementListItem) {
  if (p.bonCarburantNumero) return `Carburant — ${p.bonCarburantNumero}`;
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

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
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

function ModeBadge({ mode }: { mode: string | null | undefined }) {
  if (!mode) return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">
      <AlertCircle size={11} />À régler
    </span>
  );
  const cfg = MODE_CONFIG[mode] ?? { label: mode, cls: "bg-gray-100 text-gray-500", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
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
  onConfirm: (ref: string, telephone: string, mode?: string, ventilations?: VentilationPaiementInput[]) => void;
  loading: boolean;
  sessionCaisseOuverte?: boolean | null;
  isDelegue?: boolean;
}) {
  const [ref, setRef] = useState("");
  const [telephone, setTelephone] = useState(telProducteur(paiement) ?? "");
  const [touched, setTouched] = useState(false);
  const montantNet = paiement.montantNetFcfa ?? paiement.montantFcfa;
  const [multiMoyens, setMultiMoyens] = useState(false);
  const [ventilations, setVentilations] = useState<Array<{
    modePaiement: VentilationPaiementInput["modePaiement"];
    montantFcfa: string;
    numeroCheque: string;
    banque: string;
    dateEcheance: string;
  }>>([
    { modePaiement: "especes", montantFcfa: String(montantNet), numeroCheque: "", banque: "", dateEcheance: "" },
    { modePaiement: "cheque", montantFcfa: "0", numeroCheque: "", banque: "", dateEcheance: "" },
  ]);
  const isCarburant = isBonCarburant(paiement);
  // Pré-remplir avec le mode déjà fixé sur le paiement (livraisons normales)
  // Pour les bons carburant ou les paiements sans mode, laisser la sélection libre
  const modePreset = !isCarburant && paiement.modePaiement ? paiement.modePaiement : null;
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
  const totalVentile = ventilations.reduce((total, ligne) => total + (Number(ligne.montantFcfa) || 0), 0);
  const ventilationIncorrecte = multiMoyens && totalVentile !== montantNet;

  function handleConfirm() {
    if (multiMoyens) {
      if (ventilationIncorrecte || ventilations.some((ligne) => !Number.isInteger(Number(ligne.montantFcfa)) || Number(ligne.montantFcfa) <= 0)) {
        setTouched(true);
        return;
      }
      onConfirm("", "", undefined, ventilations.map((ligne) => ({
        modePaiement: ligne.modePaiement,
        montantFcfa: Number(ligne.montantFcfa),
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
    onConfirm(ref, telephone, selectedMode || undefined);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#e8f5ee" }}>
              <CreditCard size={18} style={{ color: "#1a4731" }} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Confirmer le paiement</h3>
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
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="font-semibold text-gray-700">Net à payer</span>
              <span className="text-xl font-bold" style={{ color: "#1a4731" }}>{fmt(paiement.montantNetFcfa ?? paiement.montantFcfa)}</span>
            </div>
          </div>

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
                        type="number"
                        min="1"
                        value={ligne.montantFcfa}
                        onChange={(e) => setVentilations((old) => old.map((item, i) => i === index ? { ...item, montantFcfa: e.target.value } : item))}
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
                  <span>{fmt(totalVentile)} / {fmt(montantNet)}</span>
                </div>
                {touched && ventilationIncorrecte && <p className="text-xs text-red-500">Le total des moyens doit correspondre au net à payer.</p>}
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

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || sessionBloquee || modeManquant}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ backgroundColor: (sessionBloquee || modeManquant) ? "#9ca3af" : "#1a4731" }}
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
              ) : <ModeBadge mode={paiement.modePaiement} />}
            </div>
            {paiement.referenceTransaction && (
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-gray-500">Référence</span>
                <span className="font-medium text-gray-900 font-mono text-xs">{paiement.referenceTransaction}</span>
              </div>
            )}
            <div className="px-4 py-3 flex justify-between items-center bg-green-50 rounded-b-xl">
              <span className="font-semibold text-gray-700">Montant payé</span>
              <span className="text-xl font-bold text-green-700">{fmt(paiement.montantNetFcfa ?? paiement.montantFcfa)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Validé le {paiement.dateValidation ? new Date(paiement.dateValidation).toLocaleDateString("fr-FR") : "—"}</span>
            <StatutBadge statut={paiement.statut} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Fermer
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ backgroundColor: "#1a4731" }}
            >
              {downloading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  <FileDown size={14} />
                  PDF
                </>
              )}
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
  const peutValider = usePermission("paiements", "valider");
  const peutRejeter = usePermission("paiements", "rejeter");
  const { utilisateur } = useAuth();
  const isDelegue = utilisateur?.role === "delegue";

  const [filtreStatut, setFiltreStatut] = useState<string>("en_attente");
  const [filtrePeriode, setFiltrePeriode] = useState<string>("");
  const [filtreSansMode, setFiltreSansMode] = useState(false);
  const [filtreProxy, setFiltreProxy] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [modal, setModal] = useState<ModalState>(null);

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

  // Stats
  const { data: stats } = useGetPaiementsStats({
    query: { queryKey: getGetPaiementsStatsQueryKey(), refetchInterval: 30_000 },
  });

  // Liste
  const params = {
    statut: filtreStatut ? (filtreStatut as ListPaiementsStatut) : undefined,
    periode: filtrePeriode ? (filtrePeriode as ListPaiementsPeriode) : undefined,
    limit: 200,
  };
  const { data: paiements, isLoading } = useListPaiements(params, {
    query: { queryKey: getListPaiementsQueryKey(params) },
  });

  const validerMut = useValiderPaiement();
  const rejeterMut = useRejeterPaiement();

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["listPaiements"] });
    qc.invalidateQueries({ queryKey: ["getPaiementsStats"] });
    for (const s of ["en_attente", "confirme", "rejete", "en_cours", "effectue", "echec", ""]) {
      qc.invalidateQueries({ queryKey: getListPaiementsQueryKey({ statut: s as ListPaiementsStatut }) });
    }
    qc.invalidateQueries({ queryKey: getGetPaiementsStatsQueryKey() });
  }

  async function handleValider(ref: string, telephone: string, mode?: ValiderPaiementInputModePaiement, ventilations?: VentilationPaiementInput[]) {
    if (modal?.type !== "valider") return;
    // Le backend n'accepte modePaiement que si : (a) pas de mode pré-sélectionné, ou (b) bon carburant
    const hasPresetMode = !!modal.paiement.modePaiement;
    const isCarburant = isBonCarburant(modal.paiement);
    const sendMode = mode && (!hasPresetMode || isCarburant);
    try {
      await validerMut.mutateAsync({
        id: modal.paiement.id,
        data: {
          referenceTransaction: ref || null,
          telephone: telephone || null,
          ...(sendMode ? { modePaiement: mode } : {}),
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
    { value: "",       label: "Toutes dates" },
    { value: "today",  label: "Aujourd'hui" },
    { value: "week",   label: "Cette semaine" },
    { value: "month",  label: "Ce mois" },
  ];

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
          label="Payés ce mois"
          value={stats ? fmt(stats.effectue_ce_mois.montant_total) : "—"}
          sub=""
          subCls=""
        />
      </div>

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
          onConfirm={(ref, telephone, mode, ventilations) => void handleValider(ref, telephone, mode as ValiderPaiementInputModePaiement | undefined, ventilations)}
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
  const showActions = p.statut === "en_attente";
  const showRecu = p.statut === "confirme" || p.statut === "effectue" || p.statut === "en_cours";
  const showRejet = p.statut === "rejete";
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
            <ModeBadge mode={p.modePaiement} />
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
          <span className="font-bold text-gray-900">{fmt(montantNet)}</span>
          <div className="flex items-center gap-1.5">
            {showActions && peutValider && !delegueBloque && (
              <button
                onClick={onValider}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: "#1a4731" }}
              >
                <CheckCircle2 size={12} />
                Valider
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

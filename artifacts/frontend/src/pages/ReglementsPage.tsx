import { useState } from "react";
import {
  CheckCircle2, Clock, XCircle, Loader2, CreditCard, Search,
  CheckCheck, AlertCircle, Banknote, Smartphone, ChevronDown,
  Receipt, Package, User, Calendar, TrendingUp, X,
} from "lucide-react";
import {
  useListPaiements,
  useValiderPaiement,
  useRejeterPaiement,
  useGetPaiementsStats,
  ListPaiementsStatut,
  ListPaiementsPeriode,
  type PaiementListItem,
  getListPaiementsQueryKey,
  getGetPaiementsStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";

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
  orange_money: { label: "Orange Money", cls: "bg-orange-100 text-orange-700", icon: <Smartphone size={11} /> },
  mtn_momo:     { label: "MTN MoMo",     cls: "bg-yellow-100 text-yellow-700", icon: <Smartphone size={11} /> },
  especes:      { label: "Espèces",      cls: "bg-gray-100 text-gray-600",     icon: <Banknote size={11} /> },
};

function StatutBadge({ statut }: { statut: string }) {
  const cfg = STATUT_CONFIG[statut] ?? { label: statut, cls: "bg-gray-100 text-gray-500", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  const cfg = MODE_CONFIG[mode] ?? { label: mode, cls: "bg-gray-100 text-gray-500", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Modal Validation ────────────────────────────────────────────────────────

function ModalValidation({
  paiement,
  onClose,
  onConfirm,
  loading,
}: {
  paiement: PaiementListItem;
  onClose: () => void;
  onConfirm: (ref: string, telephone: string) => void;
  loading: boolean;
}) {
  const [ref, setRef] = useState("");
  const [telephone, setTelephone] = useState(paiement.telephone ?? "");
  const isMobile = paiement.modePaiement === "orange_money" || paiement.modePaiement === "mtn_momo";

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
              <p className="text-xs text-gray-500">{paiement.membreNom} {paiement.membrePrenoms}</p>
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

          <div className="flex items-center gap-2">
            <ModeBadge mode={paiement.modePaiement} />
            {paiement.dateLivraison && (
              <span className="text-xs text-gray-400">Livr. {paiement.dateLivraison}</span>
            )}
          </div>

          {isMobile && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Numéro Mobile Money
              </label>
              <input
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="07 XX XX XX XX"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Référence transaction <span className="text-gray-400">(optionnel)</span>
            </label>
            <input
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="Ex: OM-2025-00123"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
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
              onClick={() => onConfirm(ref, telephone)}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "#1a4731" }}
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
              <p className="text-xs text-gray-500">{paiement.membreNom} {paiement.membrePrenoms} · {fmt(paiement.montantNetFcfa ?? paiement.montantFcfa)}</p>
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
              <span className="font-medium text-gray-900">{paiement.membreNom} {paiement.membrePrenoms}</span>
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
              <ModeBadge mode={paiement.modePaiement} />
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

          <button
            onClick={onClose}
            className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Fermer
          </button>
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

  const [filtreStatut, setFiltreStatut] = useState<string>("en_attente");
  const [filtrePeriode, setFiltrePeriode] = useState<string>("");
  const [recherche, setRecherche] = useState("");
  const [modal, setModal] = useState<ModalState>(null);

  const qc = useQueryClient();
  const { toast } = useToast();

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

  async function handleValider(ref: string, telephone: string) {
    if (modal?.type !== "valider") return;
    try {
      await validerMut.mutateAsync({
        id: modal.paiement.id,
        data: { referenceTransaction: ref || null, telephone: telephone || null },
      });
      invalidateAll();
      setModal(null);
      toast({ title: "Paiement validé", description: "Le producteur a été notifié." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de valider le paiement", variant: "destructive" });
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
    if (!recherche) return true;
    const r = recherche.toLowerCase();
    return (
      (p.membreNom ?? "").toLowerCase().includes(r) ||
      (p.membrePrenoms ?? "").toLowerCase().includes(r) ||
      (p.telephone ?? "").includes(r)
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

  return (
    <div className="space-y-5">
      {/* ── En-tête ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Règlements</h1>
        <p className="text-gray-500 text-sm mt-0.5">Validation des paiements producteurs</p>
      </div>

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
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
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
          onConfirm={handleValider}
          loading={validerMut.isPending}
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

function PaiementRow({
  paiement: p,
  peutValider,
  peutRejeter,
  onValider,
  onRejeter,
  onRecu,
}: {
  paiement: PaiementListItem;
  peutValider: boolean;
  peutRejeter: boolean;
  onValider: () => void;
  onRejeter: () => void;
  onRecu: () => void;
}) {
  const poids = p.poidsNetKg ?? p.poidsKg;
  const montantNet = p.montantNetFcfa ?? p.montantFcfa;
  const showActions = p.statut === "en_attente";
  const showRecu = p.statut === "confirme" || p.statut === "effectue" || p.statut === "en_cours";
  const showRejet = p.statut === "rejete";

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        {/* Infos producteur */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900 text-sm">
              {p.membreNom} {p.membrePrenoms}
            </p>
            <StatutBadge statut={p.statut} />
            <ModeBadge mode={p.modePaiement} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {p.telephone && <span>{p.telephone}</span>}
            {p.dateLivraison && <span>Livr. {p.dateLivraison}</span>}
            {poids && <span>{fmtPoids(poids)}</span>}
          </div>
          {/* Décomposition montants */}
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
          {/* Motif rejet */}
          {showRejet && p.motifRejet && (
            <p className="text-xs text-red-500 italic mt-1">Motif : {p.motifRejet}</p>
          )}
        </div>

        {/* Montant net + actions */}
        <div className="text-right flex flex-col items-end gap-2 shrink-0">
          <span className="font-bold text-gray-900">{fmt(montantNet)}</span>
          <div className="flex items-center gap-1.5">
            {showActions && peutValider && (
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

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAllOps, deleteOp,
  type PendingAdminOp, type LivraisonData, type AvanceData, type RemboursementData,
} from "@/lib/idb";
import { useOffline } from "@/contexts/OfflineContext";
import { useGetMembres } from "@workspace/api-client-react";
import {
  CloudOff, RefreshCw, Trash2, CheckCircle2,
  AlertCircle, Package, CreditCard, RotateCcw,
  ArrowLeft, Clock, WifiOff,
} from "lucide-react";

function formaterDate(ts: number) {
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function formaterFCFA(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

const TYPE_LABELS: Record<string, string> = {
  livraison:     "Livraison",
  avance:        "Avance",
  remboursement: "Remboursement",
};
const TYPE_COLORS: Record<string, string> = {
  livraison:     "bg-green-100 text-green-800 border-green-200",
  avance:        "bg-blue-100  text-blue-800  border-blue-200",
  remboursement: "bg-amber-100 text-amber-800 border-amber-200",
};
const TYPE_ICONS: Record<string, React.ElementType> = {
  livraison:     Package,
  avance:        CreditCard,
  remboursement: RotateCcw,
};

function OpSummary({ op, membres }: { op: PendingAdminOp; membres: Record<number, string> }) {
  if (op.type === "livraison") {
    const d = op.data as LivraisonData;
    const nomMembre = d.membreId != null
      ? (membres[d.membreId] ?? `Membre #${d.membreId}`)
      : d.fournisseurId != null
        ? `Fournisseur ext. #${d.fournisseurId}`
        : "Producteur inconnu";
    const montantBrut = Math.round(d.poidsKg * d.prixUnitaireFcfa);
    return (
      <div className="text-sm text-gray-700 space-y-0.5">
        <p><span className="text-gray-500">Producteur :</span> <span className="font-medium">{nomMembre}</span></p>
        <p><span className="text-gray-500">Poids net :</span> {d.poidsKg} kg</p>
        <p><span className="text-gray-500">Prix :</span> {formaterFCFA(d.prixUnitaireFcfa)}/kg</p>
        <p><span className="text-gray-500">Montant estimé :</span> <span className="font-semibold text-gray-900">{formaterFCFA(montantBrut)}</span></p>
        <p><span className="text-gray-500">Date :</span> {d.dateLivraison}</p>
      </div>
    );
  }
  if (op.type === "avance") {
    const d = op.data as AvanceData;
    const nomMembre = membres[d.membreId] ?? `Membre #${d.membreId}`;
    return (
      <div className="text-sm text-gray-700 space-y-0.5">
        <p><span className="text-gray-500">Membre :</span> <span className="font-medium">{nomMembre}</span></p>
        <p><span className="text-gray-500">Montant :</span> <span className="font-semibold text-gray-900">{formaterFCFA(d.montantOctroyeFcfa)}</span></p>
        <p><span className="text-gray-500">Date octroi :</span> {d.dateOctroi}</p>
        {d.motif && <p><span className="text-gray-500">Motif :</span> {d.motif}</p>}
      </div>
    );
  }
  const d = op.data as RemboursementData;
  return (
    <div className="text-sm text-gray-700 space-y-0.5">
      <p><span className="text-gray-500">Avance #:</span> {d.avanceId}</p>
      <p><span className="text-gray-500">Montant :</span> <span className="font-semibold text-gray-900">{formaterFCFA(d.montantFcfa)}</span></p>
    </div>
  );
}

export default function PendingOpsPage() {
  const [, navigate] = useLocation();
  const { isOnline, pendingCount, syncStatus, triggerSync } = useOffline();
  const queryClient = useQueryClient();
  const [ops, setOps]           = useState<PendingAdminOp[]>([]);
  const [loading, setLoading]   = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [tab, setTab]           = useState<"pending" | "error" | "synced">("pending");

  const { data: membresData } = useGetMembres({ limit: 500 });
  const membres: Record<number, string> = {};
  for (const m of membresData?.membres ?? []) {
    membres[m.id] = `${m.nom} ${m.prenoms}`;
  }

  const loadOps = useCallback(async () => {
    setLoading(true);
    try { setOps(await getAllOps()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadOps(); }, [loadOps]);

  const handleDelete = async (localId: string) => {
    setDeleting(localId);
    try {
      await deleteOp(localId);
      await loadOps();
      queryClient.invalidateQueries();
    } finally {
      setDeleting(null);
    }
  };

  const handleSync = async () => {
    await triggerSync();
    setTimeout(() => void loadOps(), 1200);
  };

  const pendingOps = ops.filter(o => o.status === "pending");
  const errorOps   = ops.filter(o => o.status === "error");
  const syncedOps  = ops.filter(o => o.status === "synced");

  const currentOps = tab === "pending" ? pendingOps : tab === "error" ? errorOps : syncedOps;

  const tabClass = (t: typeof tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t
      ? "bg-white text-gray-900 shadow-sm"
      : "text-gray-500 hover:text-gray-700"}`;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* En-tête */}
      <div>
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
        >
          <ArrowLeft size={15} />
          Tableau de bord
        </button>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <CloudOff size={22} className="text-amber-500" />
              Opérations hors ligne
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {pendingCount > 0
                ? `${pendingCount} opération${pendingCount > 1 ? "s" : ""} en attente de synchronisation`
                : "Toutes les opérations sont synchronisées"}
            </p>
          </div>
          {isOnline && pendingOps.length > 0 && (
            <button
              onClick={handleSync}
              disabled={syncStatus === "syncing"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: "#1a4731" }}
            >
              <RefreshCw size={15} className={syncStatus === "syncing" ? "animate-spin" : ""} />
              {syncStatus === "syncing" ? "Synchronisation…" : "Synchroniser maintenant"}
            </button>
          )}
          {!isOnline && (
            <div className="flex items-center gap-2 text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <WifiOff size={14} />
              Hors ligne
            </div>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="bg-gray-100 p-1 rounded-xl flex gap-1">
        <button className={tabClass("pending")} onClick={() => setTab("pending")}>
          En attente
          {pendingOps.length > 0 && (
            <span className="ml-1.5 bg-amber-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5">
              {pendingOps.length}
            </span>
          )}
        </button>
        <button className={tabClass("error")} onClick={() => setTab("error")}>
          Échecs
          {errorOps.length > 0 && (
            <span className="ml-1.5 bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5">
              {errorOps.length}
            </span>
          )}
        </button>
        <button className={tabClass("synced")} onClick={() => setTab("synced")}>
          Synchronisées
          {syncedOps.length > 0 && (
            <span className="ml-1.5 bg-green-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5">
              {syncedOps.length}
            </span>
          )}
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-gray-400" />
        </div>
      ) : currentOps.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle2 size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {tab === "pending" ? "Aucune opération en attente" :
             tab === "error"   ? "Aucun échec enregistré" :
             "Aucune opération synchronisée récemment"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentOps.map((op) => {
            const Icon = TYPE_ICONS[op.type] ?? Package;
            return (
              <div
                key={op.localId}
                className="bg-white rounded-xl border border-gray-200 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${TYPE_COLORS[op.type] ?? ""}`}>
                      <Icon size={12} />
                      {TYPE_LABELS[op.type]}
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock size={11} />
                      {formaterDate(op.timestamp)}
                    </span>
                    {op.tentatives != null && op.tentatives > 0 && (
                      <span className="text-xs text-orange-600">
                        {op.tentatives} tentative{op.tentatives > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {(op.status === "pending" || op.status === "error") && (
                    <button
                      onClick={() => handleDelete(op.localId)}
                      disabled={deleting === op.localId}
                      title="Annuler cette opération"
                      className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deleting === op.localId
                        ? <RefreshCw size={15} className="animate-spin" />
                        : <Trash2 size={15} />
                      }
                    </button>
                  )}

                  {op.status === "synced" && (
                    <CheckCircle2 size={18} className="shrink-0 text-green-600 mt-0.5" />
                  )}
                </div>

                <OpSummary op={op} membres={membres} />

                {op.status === "error" && op.errorMsg && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                    <AlertCircle size={13} className="shrink-0 mt-0.5" />
                    {op.errorMsg}
                  </div>
                )}

                {op.status === "synced" && op.syncedAt && (
                  <p className="text-xs text-green-700">
                    Synchronisée le {formaterDate(op.syncedAt)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

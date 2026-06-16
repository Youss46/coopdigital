import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, Clock, CheckCircle2, AlertTriangle,
  RefreshCw, Trash2, Camera, WifiOff,
} from "lucide-react";
import {
  getAllPhotos, deletePhoto, resetPhotoToRetry, type PendingPhoto,
} from "@/lib/idb";
import { useOffline } from "@/contexts/OfflineContext";

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

function StatusBadge({ status }: { status: PendingPhoto["status"] }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
        <Clock size={11} /> En attente
      </span>
    );
  }
  if (status === "synced") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
        <CheckCircle2 size={11} /> Synchronisée
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
      <AlertTriangle size={11} /> Erreur
    </span>
  );
}

export default function OpsPendantesPage() {
  const [, setLoc] = useLocation();
  const { isOnline, syncStatus, triggerSync } = useOffline();
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [loading, setLoading]     = useState(true);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [retrying, setRetrying]   = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    const all = await getAllPhotos();
    setPhotos(all);
    setLoading(false);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  useEffect(() => {
    if (syncStatus === "done" || syncStatus === "idle") {
      void charger();
    }
  }, [syncStatus, charger]);

  const handleDelete = async (localId: string) => {
    setDeleting(localId);
    await deletePhoto(localId);
    setPhotos((prev) => prev.filter((p) => p.localId !== localId));
    setDeleting(null);
  };

  const handleRetry = async (localId: string) => {
    setRetrying(localId);
    await resetPhotoToRetry(localId);
    await charger();
    setRetrying(null);
    void triggerSync();
  };

  const pending = photos.filter((p) => p.status === "pending");
  const errors  = photos.filter((p) => p.status === "error");
  const synced  = photos.filter((p) => p.status === "synced");

  const isSyncing = syncStatus === "syncing";

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <div className="bg-green-800 text-white px-4 pt-10 pb-5">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => setLoc("/")}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-lg font-bold">Opérations en attente</h1>
        </div>
        <p className="text-green-200 text-sm pl-11">
          Actions enregistrées hors ligne
        </p>
      </div>

      {/* Statut connexion */}
      <div className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${isOnline ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
        {isOnline ? (
          <>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Connecté — synchronisation automatique active
          </>
        ) : (
          <>
            <WifiOff size={14} />
            Hors connexion — les opérations seront synchronisées à la reconnexion
          </>
        )}
      </div>

      <div className="px-4 pt-4 space-y-5 max-w-lg mx-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw size={24} className="animate-spin text-green-600" />
          </div>
        ) : photos.length === 0 ? (
          /* État vide */
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
            <CheckCircle2 size={48} className="text-green-300" />
            <p className="text-sm font-medium text-gray-500">Aucune opération en attente</p>
            <p className="text-xs text-gray-400">Toutes les données sont synchronisées</p>
          </div>
        ) : (
          <>
            {/* ── En attente ─────────────────────────────────────────────── */}
            {pending.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  En attente ({pending.length})
                </h2>
                <div className="space-y-3">
                  {pending.map((p) => (
                    <PhotoCard
                      key={p.localId}
                      photo={p}
                      isSyncing={isSyncing}
                      isOnline={isOnline}
                      deleting={deleting === p.localId}
                      retrying={retrying === p.localId}
                      onDelete={() => handleDelete(p.localId)}
                      onRetry={() => handleRetry(p.localId)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Erreurs ─────────────────────────────────────────────────── */}
            {errors.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-red-500 mb-2">
                  Échecs ({errors.length})
                </h2>
                <div className="space-y-3">
                  {errors.map((p) => (
                    <PhotoCard
                      key={p.localId}
                      photo={p}
                      isSyncing={isSyncing}
                      isOnline={isOnline}
                      deleting={deleting === p.localId}
                      retrying={retrying === p.localId}
                      onDelete={() => handleDelete(p.localId)}
                      onRetry={() => handleRetry(p.localId)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Synchronisées ───────────────────────────────────────────── */}
            {synced.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Synchronisées récemment ({synced.length})
                </h2>
                <div className="space-y-3">
                  {synced.map((p) => (
                    <PhotoCard
                      key={p.localId}
                      photo={p}
                      isSyncing={false}
                      isOnline={isOnline}
                      deleting={deleting === p.localId}
                      retrying={false}
                      onDelete={() => handleDelete(p.localId)}
                      onRetry={() => {}}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Bouton sync manuel */}
        {isOnline && pending.length > 0 && (
          <button
            onClick={() => triggerSync()}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-700 text-white font-semibold text-sm disabled:opacity-60 active:bg-green-800"
          >
            <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "Synchronisation…" : "Synchroniser maintenant"}
          </button>
        )}
      </div>
    </div>
  );
}

function PhotoCard({
  photo, isSyncing, isOnline, deleting, retrying, onDelete, onRetry,
}: {
  photo: PendingPhoto;
  isSyncing: boolean;
  isOnline: boolean;
  deleting: boolean;
  retrying: boolean;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const tentatives = photo.tentatives ?? 0;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      photo.status === "error" ? "border-red-200" :
      photo.status === "synced" ? "border-green-100" :
      "border-amber-200"
    }`}>
      <div className="flex items-start gap-3 p-4">
        {/* Miniature */}
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
          {photo.dataUrl ? (
            <img
              src={photo.dataUrl}
              alt="Photo de profil"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Camera size={20} className="text-gray-400" />
            </div>
          )}
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">Photo de profil</span>
            <StatusBadge status={photo.status} />
          </div>
          <p className="text-xs text-gray-500">
            Enregistrée le {fmtDate(photo.timestamp)}
          </p>
          {photo.status === "synced" && photo.syncedAt && (
            <p className="text-xs text-green-600 mt-0.5">
              Synchronisée le {fmtDate(photo.syncedAt)}
            </p>
          )}
          {photo.status === "error" && (
            <>
              <p className="text-xs text-red-600 mt-0.5 break-words">{photo.errorMsg}</p>
              {tentatives >= 3 && (
                <p className="text-xs text-red-500 font-medium mt-0.5">
                  Échec définitif après {tentatives} tentatives
                </p>
              )}
            </>
          )}
          {photo.status === "pending" && isSyncing && (
            <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
              <RefreshCw size={10} className="animate-spin" /> Synchronisation en cours…
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      {photo.status !== "synced" && (
        <div className="border-t border-gray-100 flex divide-x divide-gray-100">
          {photo.status === "error" && (
            <button
              onClick={onRetry}
              disabled={retrying || isSyncing || !isOnline}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-green-700 font-medium disabled:opacity-50"
            >
              <RefreshCw size={13} className={retrying ? "animate-spin" : ""} />
              Réessayer
            </button>
          )}
          {confirmDel ? (
            <>
              <button
                onClick={() => { setConfirmDel(false); onDelete(); }}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm text-red-600 font-semibold"
              >
                {deleting ? "Suppression…" : "Confirmer"}
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                className="flex-1 py-2.5 text-sm text-gray-500"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              disabled={deleting}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-red-500 font-medium disabled:opacity-50"
            >
              <Trash2 size={13} />
              Supprimer
            </button>
          )}
        </div>
      )}
      {photo.status === "synced" && (
        <div className="border-t border-gray-100 flex">
          {confirmDel ? (
            <>
              <button
                onClick={() => { setConfirmDel(false); onDelete(); }}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm text-red-600 font-semibold"
              >
                {deleting ? "Suppression…" : "Confirmer"}
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                className="flex-1 py-2.5 text-sm text-gray-500"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-gray-400 font-medium"
            >
              <Trash2 size={13} />
              Effacer de l'historique
            </button>
          )}
        </div>
      )}
    </div>
  );
}

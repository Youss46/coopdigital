import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock3, Loader2, RefreshCw, X } from "lucide-react";
import { useOffline } from "@/contexts/OfflineContext";
import { getPendingCount } from "@/lib/idb";
import { usePwaServiceWorker } from "@/lib/pwaServiceWorker";
import {
  clearPwaUpdateReminder,
  deferPwaUpdateReminder,
  getPwaUpdateReminderDelay,
  getPwaUpdateReminderAt,
} from "@/lib/pwaUpdateReminder";

export default function PwaUpdateBanner({ visible = true }: { visible?: boolean }) {
  const { isOnline, pendingCount, syncStatus, triggerSync } = useOffline();
  const updateCheckInterval = useRef<number | null>(null);
  const { needRefresh: [needRefresh], updateServiceWorker } = usePwaServiceWorker({
    immediate: true,
    onRegisteredSW: (_swUrl, registration) => {
      if (!registration) return;

      void registration.update().catch(() => {});
      if (updateCheckInterval.current !== null) {
        window.clearInterval(updateCheckInterval.current);
      }
      updateCheckInterval.current = window.setInterval(() => {
        void registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    },
    onOfflineReady: () => {
      console.info("CoopDigital prêt hors connexion");
    },
    onNeedReload: () => {
      clearPwaUpdateReminder(localStorage);
      window.location.reload();
    },
    onRegisterError: (error) => {
      console.warn("Enregistrement du service worker impossible", error);
    },
  });
  const [showBanner, setShowBanner] = useState(false);
  const [reminderAt, setReminderAt] = useState<number | null>(() =>
    getPwaUpdateReminderAt(localStorage),
  );
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [workSavedConfirmed, setWorkSavedConfirmed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (updateCheckInterval.current !== null) {
        window.clearInterval(updateCheckInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!needRefresh) {
      setShowBanner(false);
      return;
    }

    const delay = getPwaUpdateReminderDelay(localStorage);
    if (delay === null || delay === 0) {
      clearPwaUpdateReminder(localStorage);
      setReminderAt(null);
      setShowBanner(true);
      return;
    }

    setShowBanner(false);

    const reminderTimer = window.setTimeout(() => {
      clearPwaUpdateReminder(localStorage);
      setReminderAt(null);
      setShowBanner(true);
    }, delay);

    const checkReminder = () => {
      if (document.visibilityState !== "visible") return;
      const remaining = getPwaUpdateReminderDelay(localStorage);
      if (remaining === null || remaining === 0) {
        clearPwaUpdateReminder(localStorage);
        setReminderAt(null);
        setShowBanner(true);
      }
    };
    window.addEventListener("focus", checkReminder);
    document.addEventListener("visibilitychange", checkReminder);

    return () => {
      window.clearTimeout(reminderTimer);
      window.removeEventListener("focus", checkReminder);
      document.removeEventListener("visibilitychange", checkReminder);
    };
  }, [needRefresh, reminderAt]);

  const handleRemindLater = () => {
    const nextReminderAt = deferPwaUpdateReminder(localStorage);
    setReminderAt(nextReminderAt);
    setShowBanner(false);
    setConfirmationOpen(false);
    setWorkSavedConfirmed(false);
    setUpdateMessage(null);
  };

  const handleUpdateNow = async () => {
    if (updating || syncStatus === "syncing") return;
    if (!isOnline) {
      setUpdateMessage("Reconnectez-vous pour synchroniser vos opérations avant la mise à jour.");
      return;
    }

    setUpdating(true);
    setUpdateMessage(null);
    try {
      const pendingBeforeSync = await getPendingCount();
      if (pendingBeforeSync > 0) {
        await triggerSync();
        const pendingAfterSync = await getPendingCount();
        if (pendingAfterSync > 0) {
          setUpdateMessage(
            `${pendingAfterSync} opération(s) restent à synchroniser. La mise à jour attendra leur envoi.`,
          );
          return;
        }
      }

      clearPwaUpdateReminder(localStorage);
      setReminderAt(null);
      await updateServiceWorker(true);
    } catch {
      setUpdateMessage("La synchronisation n’a pas abouti. Vos opérations sont conservées; réessayez après vérification.");
    } finally {
      setUpdating(false);
    }
  };

  if (!visible || !needRefresh || !showBanner) return null;

  return (
    <>
      <section
        role="status"
        aria-live="polite"
        data-testid="pwa-update-banner"
        className="fixed inset-x-3 bottom-5 z-[80] mx-auto max-w-xl rounded-xl border border-green-200 bg-white p-4 shadow-xl sm:inset-x-auto sm:right-6 sm:w-[min(28rem,calc(100vw-3rem))]"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-green-100 p-2 text-green-800">
            <RefreshCw size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">Une nouvelle version de CoopDigital est prête</p>
            <p className="mt-1 text-sm text-gray-600">
              Choisissez quand recharger l’application. Vos opérations en attente seront synchronisées avant la mise à jour.
            </p>
            {syncStatus === "syncing" ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-blue-800">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                Synchronisation en cours…
              </p>
            ) : pendingCount > 0 ? (
              <p className="mt-2 text-xs text-amber-800">
                {pendingCount} opération(s) attendent la synchronisation.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="button-pwa-update-now"
                onClick={() => {
                  setUpdateMessage(null);
                  setWorkSavedConfirmed(false);
                  setConfirmationOpen(true);
                }}
                className="rounded-lg bg-green-800 px-3 py-2 text-sm font-semibold text-white hover:bg-green-900"
              >
                Mettre à jour maintenant
              </button>
              <button
                type="button"
                data-testid="button-pwa-update-later"
                onClick={handleRemindLater}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Clock3 size={14} aria-hidden="true" />
                Me le rappeler dans 10 min
              </button>
            </div>
          </div>
        </div>
      </section>

      {confirmationOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pwa-update-confirm-title"
            aria-describedby="pwa-update-confirm-description"
            data-testid="pwa-update-confirmation"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 text-amber-600" size={20} aria-hidden="true" />
              <div className="flex-1">
                <h2 id="pwa-update-confirm-title" className="font-semibold text-gray-900">
                  Recharger CoopDigital ?
                </h2>
                <p id="pwa-update-confirm-description" className="mt-2 text-sm text-gray-600">
                  La page va se recharger. Enregistrez vos saisies en cours avant de continuer.
                  Les opérations hors ligne seront synchronisées avant le rechargement.
                </p>
              </div>
              <button
                type="button"
                data-testid="button-close-pwa-update-confirmation"
                onClick={() => {
                  setConfirmationOpen(false);
                  setWorkSavedConfirmed(false);
                }}
                aria-label="Fermer"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {!isOnline && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Une connexion Internet est nécessaire pour vérifier et synchroniser les opérations en attente.
              </p>
            )}
            {syncStatus === "syncing" && (
              <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                La synchronisation est en cours. Vous pourrez appliquer la mise à jour dès qu’elle sera terminée.
              </p>
            )}
            {updateMessage && (
              <p role="alert" data-testid="pwa-update-error" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {updateMessage}
              </p>
            )}

            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                data-testid="checkbox-pwa-work-saved"
                checked={workSavedConfirmed}
                onChange={(event) => setWorkSavedConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-800 focus:ring-green-700"
              />
              <span>J’ai terminé ou enregistré mes saisies en cours.</span>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmationOpen(false);
                  setWorkSavedConfirmed(false);
                }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Continuer le travail
              </button>
              <button
                type="button"
                data-testid="button-confirm-pwa-update"
                onClick={() => void handleUpdateNow()}
                disabled={!workSavedConfirmed || !isOnline || syncStatus === "syncing" || updating}
                className="inline-flex items-center gap-2 rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updating && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                {updating ? "Préparation…" : "Synchroniser et mettre à jour"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

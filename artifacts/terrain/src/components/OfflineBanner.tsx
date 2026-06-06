import { useOffline } from "../contexts/OfflineContext";

export default function OfflineBanner() {
  const { isOnline, pendingCount, syncStatus, syncResult, triggerSync } = useOffline();

  // Tout va bien → rien à afficher
  if (isOnline && syncStatus === "idle" && pendingCount === 0) return null;

  // Synchronisation réussie → bannière verte temporaire
  if (syncStatus === "done" && syncResult) {
    return (
      <div className="t-offline-banner t-offline-banner--done">
        <span>
          ✅ {syncResult.succes} opération{syncResult.succes !== 1 ? "s" : ""} synchronisée{syncResult.succes !== 1 ? "s" : ""}
          {syncResult.echecs > 0 && ` — ${syncResult.echecs} échec${syncResult.echecs !== 1 ? "s" : ""}`}
        </span>
      </div>
    );
  }

  // En cours de synchronisation
  if (syncStatus === "syncing") {
    return (
      <div className="t-offline-banner t-offline-banner--syncing">
        <span className="t-spinner-inline" />
        <span>Synchronisation en cours…</span>
      </div>
    );
  }

  // Erreur de synchronisation
  if (syncStatus === "error") {
    return (
      <div className="t-offline-banner t-offline-banner--error">
        <span>❌ Erreur de synchronisation</span>
        <button className="t-banner-btn" onClick={() => void triggerSync()}>
          Réessayer
        </button>
      </div>
    );
  }

  // Hors ligne
  if (!isOnline) {
    return (
      <div className="t-offline-banner t-offline-banner--offline">
        <div className="t-offline-banner__left">
          <span>📴</span>
          <div>
            <div style={{ fontWeight: 700 }}>MODE HORS LIGNE</div>
            {pendingCount > 0 && (
              <div style={{ fontSize: ".8rem", opacity: .85 }}>
                {pendingCount} opération{pendingCount !== 1 ? "s" : ""} en attente
              </div>
            )}
          </div>
        </div>
        {pendingCount > 0 && (
          <span className="t-banner-count">{pendingCount}</span>
        )}
      </div>
    );
  }

  // En ligne mais opérations en attente
  if (isOnline && pendingCount > 0) {
    return (
      <div className="t-offline-banner t-offline-banner--pending">
        <span>⏳ {pendingCount} opération{pendingCount !== 1 ? "s" : ""} en attente</span>
        <button className="t-banner-btn" onClick={() => void triggerSync()}>
          Sync →
        </button>
      </div>
    );
  }

  return null;
}

import { useOffline } from "../contexts/OfflineContext";

export default function OfflineBanner() {
  const { isOnline, pendingCount, syncStatus, triggerSync } = useOffline();

  if (isOnline && syncStatus === "idle" && pendingCount === 0) return null;

  if (!isOnline) {
    return (
      <div className="t-offline-banner">
        <span>📴 Hors ligne — {pendingCount > 0 ? `${pendingCount} opération(s) en attente` : "mode hors ligne"}</span>
      </div>
    );
  }

  if (syncStatus === "syncing") {
    return (
      <div className="t-offline-banner t-offline-banner--syncing">
        <span>🔄 Synchronisation en cours…</span>
      </div>
    );
  }

  if (syncStatus === "done") {
    return (
      <div className="t-offline-banner t-offline-banner--done">
        <span>✅ Synchronisation réussie</span>
      </div>
    );
  }

  if (syncStatus === "error") {
    return (
      <div className="t-offline-banner">
        <span>❌ Erreur de synchronisation</span>
        <button
          style={{ background: "transparent", border: "1px solid #fff", color: "#fff", borderRadius: "6px", padding: "4px 12px", fontWeight: 700, cursor: "pointer" }}
          onClick={triggerSync}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="t-offline-banner t-offline-banner--syncing">
        <span>🔄 {pendingCount} opération(s) à synchroniser</span>
        <button
          style={{ background: "transparent", border: "1px solid #fff", color: "#fff", borderRadius: "6px", padding: "4px 12px", fontWeight: 700, cursor: "pointer" }}
          onClick={triggerSync}
        >
          Sync
        </button>
      </div>
    );
  }

  return null;
}

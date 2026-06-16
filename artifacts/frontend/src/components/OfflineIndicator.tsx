import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { useOffline } from "@/contexts/OfflineContext";

export function OfflineBanner() {
  const { isOnline, pendingCount, syncStatus } = useOffline();

  if (isOnline && syncStatus === "idle") return null;

  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white text-sm font-medium px-4 py-2.5 flex items-center justify-center gap-2 shadow-md">
        <WifiOff size={15} className="shrink-0" />
        <span>
          Hors connexion
          {pendingCount > 0 ? (
            <> — <strong>{pendingCount} opération{pendingCount > 1 ? "s" : ""}</strong> en attente
              {" · "}<Link href="/ops-en-attente" className="underline underline-offset-2">Voir</Link>
            </>
          ) : " — données en cache affichées"}
        </span>
      </div>
    );
  }

  if (syncStatus === "syncing") {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white text-sm font-medium px-4 py-2.5 flex items-center justify-center gap-2 shadow-md">
        <RefreshCw size={15} className="animate-spin shrink-0" />
        <span>Synchronisation en cours…</span>
      </div>
    );
  }

  return null;
}

export function OnlineToast() {
  const { syncStatus, syncResult } = useOffline();
  const [show, setShow]         = useState(false);
  const [wasOffline, setWasOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const onOnline  = () => { setWasOffline(false); if (wasOffline) setShow(true); };
    const onOffline = () => setWasOffline(true);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [wasOffline]);

  useEffect(() => {
    if (syncStatus !== "done") return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 4000);
    return () => clearTimeout(t);
  }, [syncStatus]);

  if (!show) return null;

  if (syncStatus === "done" && syncResult && (syncResult.succes > 0 || syncResult.echecs > 0)) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-full flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
        <CheckCircle size={15} />
        {syncResult.succes > 0
          ? `${syncResult.succes} opération${syncResult.succes > 1 ? "s synchronisées" : " synchronisée"}`
          : "Connexion rétablie"}
        {syncResult.echecs > 0 && (
          <span className="text-yellow-200 ml-1">· {syncResult.echecs} échec{syncResult.echecs > 1 ? "s" : ""}</span>
        )}
      </div>
    );
  }

  if (syncStatus === "error") {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
        <AlertTriangle size={15} />
        Erreur de synchronisation — nouvelle tentative bientôt
      </div>
    );
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-full flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
      <Wifi size={15} />
      Connexion rétablie
    </div>
  );
}

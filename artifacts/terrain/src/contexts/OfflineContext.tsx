import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getPendingOps, getPendingCount, markOpSynced, markOpError } from "../lib/idb";
import { syncOps } from "../lib/api";
import type { PendingOp } from "../lib/types";

interface OfflineContextValue {
  isOnline: boolean;
  pendingCount: number;
  syncStatus: "idle" | "syncing" | "done" | "error";
  triggerSync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  pendingCount: 0,
  syncStatus: "idle",
  triggerSync: async () => {},
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");

  useEffect(() => {
    function onOnline() { setIsOnline(true); }
    function onOffline() { setIsOnline(false); }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    getPendingCount().then(setPendingCount);
  }, []);

  const triggerSync = useCallback(async () => {
    const ops = await getPendingOps();
    if (ops.length === 0) return;

    setSyncStatus("syncing");
    try {
      const result = await syncOps(ops);
      for (const localId of result.succes) {
        await markOpSynced(localId);
      }
      for (const { localId, erreur } of result.echecs) {
        await markOpError(localId, erreur);
      }
      setPendingCount(await getPendingCount());
      setSyncStatus("done");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 3000);
    }
  }, []);

  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      triggerSync();
    }
  }, [isOnline, pendingCount, triggerSync]);

  return (
    <OfflineContext.Provider value={{ isOnline, pendingCount, syncStatus, triggerSync }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}

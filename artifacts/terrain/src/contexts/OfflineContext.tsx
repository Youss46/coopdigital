import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, type ReactNode,
} from "react";
import {
  getPendingOps, getPendingCount,
  markOpSyncedWithTs, markOpError, incrementTentatives,
  getPendingGpsOps, markGpsOpSynced, markGpsOpError, incrementGpsTentatives,
  getPendingEnqueteOps, markEnqueteOpSynced, markEnqueteOpError, incrementEnqueteTentatives,
  getPendingBrouillons, markBrouillonSynced, markBrouillonError,
} from "../lib/idb";
import { syncOps, syncGpsOps, syncEnqueteOps, batchSyncBrouillon } from "../lib/api";

export interface SyncResult {
  succes: number;
  echecs: number;
  /** Collectes enregistrées en mode proxy avec le nom du délégué concerné */
  collectesProxy: Array<{ localId: string; saisiePour: string }>;
}

interface OfflineContextValue {
  isOnline: boolean;
  pendingCount: number;
  syncStatus: "idle" | "syncing" | "done" | "error";
  syncResult: SyncResult | null;
  triggerSync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  pendingCount: 0,
  syncStatus: "idle",
  syncResult: null,
  triggerSync: async () => {},
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline]         = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus]     = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncResult, setSyncResult]     = useState<SyncResult | null>(null);
  const syncingRef    = useRef(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCount = useCallback(async () => {
    setPendingCount(await getPendingCount());
  }, []);

  const triggerSync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    const [ops, gpsOps, enqOps, pendingBrouillons] = await Promise.all([
      getPendingOps(), getPendingGpsOps(), getPendingEnqueteOps(), getPendingBrouillons(),
    ]);
    if (ops.length === 0 && gpsOps.length === 0 && enqOps.length === 0 && pendingBrouillons.length === 0) return;

    syncingRef.current = true;
    setSyncStatus("syncing");
    setSyncResult(null);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

    let nbSucces = 0;
    let nbEchecs = 0;
    const allCollectesProxy: Array<{ localId: string; saisiePour: string }> = [];

    try {
      if (ops.length > 0) {
        const result = await syncOps(ops);
        for (const localId of result.succes) { await markOpSyncedWithTs(localId); nbSucces++; }
        for (const { localId, erreur } of result.echecs) {
          const t = await incrementTentatives(localId);
          if (t >= 3) await markOpError(localId, `Échec définitif (${t} tentatives) : ${erreur}`);
          nbEchecs++;
        }
        allCollectesProxy.push(...(result.collectesProxy ?? []));
      }

      if (gpsOps.length > 0) {
        const gpsResult = await syncGpsOps(gpsOps);
        for (const localId of gpsResult.succes) { await markGpsOpSynced(localId); nbSucces++; }
        for (const { localId } of gpsResult.echecs) {
          const t = await incrementGpsTentatives(localId);
          if (t >= 3) await markGpsOpError(localId);
          nbEchecs++;
        }
      }

      if (enqOps.length > 0) {
        const enqResult = await syncEnqueteOps(enqOps);
        for (const localId of enqResult.succes) { await markEnqueteOpSynced(localId); nbSucces++; }
        for (const { localId, erreur } of enqResult.echecs) {
          const t = await incrementEnqueteTentatives(localId);
          if (t >= 3) await markEnqueteOpError(localId, `Échec définitif (${t} tentatives) : ${erreur}`);
          nbEchecs++;
        }
      }

      // ── Sync brouillons de pesée hors-ligne ───────────────────────────────
      if (pendingBrouillons.length > 0) {
        for (const brouillon of pendingBrouillons) {
          try {
            const result = await batchSyncBrouillon(brouillon);
            await markBrouillonSynced(brouillon.localId, result.sessionId, result.numeroSession);
            nbSucces++;
          } catch (err) {
            await markBrouillonError(brouillon.localId, (err as Error).message);
            nbEchecs++;
          }
        }
      }

      await refreshCount();
      setSyncResult({ succes: nbSucces, echecs: nbEchecs, collectesProxy: allCollectesProxy });
      setSyncStatus("done");
      clearTimerRef.current = setTimeout(() => {
        setSyncStatus("idle");
        setSyncResult(null);
      }, 4000);
    } catch {
      setSyncStatus("error");
      clearTimerRef.current = setTimeout(() => setSyncStatus("idle"), 4000);
    } finally {
      syncingRef.current = false;
    }
  }, [refreshCount]);

  // ── Événements réseau ───────────────────────────────────────────────────────
  useEffect(() => {
    function onOnline() { setIsOnline(true); triggerSync(); }
    function onOffline() { setIsOnline(false); }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [triggerSync]);

  // ── Messages Service Worker (Background Sync) ───────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === "SYNC_REQUESTED") {
        triggerSync();
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [triggerSync]);

  // ── Auto-sync toutes les 5 minutes quand en ligne ───────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) triggerSync();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [triggerSync]);

  // ── Initialisation : compteur + sync immédiate si nécessaire ────────────────
  useEffect(() => {
    getPendingCount().then((count) => {
      setPendingCount(count);
      if (count > 0 && navigator.onLine) triggerSync();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OfflineContext.Provider
      value={{ isOnline, pendingCount, syncStatus, syncResult, triggerSync }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}

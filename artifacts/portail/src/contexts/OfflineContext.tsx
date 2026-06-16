import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, type ReactNode,
} from "react";
import {
  getLatestPendingPhoto, hasPendingPhoto,
  markPhotoSynced, markPhotoError, incrementPhotoTentatives,
} from "@/lib/idb";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

async function uploadPhotoApi(dataUrl: string): Promise<void> {
  const token = localStorage.getItem("portail_token");
  const res = await fetch(`${BASE_URL}/api/portail/photo`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ photoUrl: dataUrl }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { erreur?: string };
    throw new Error(b.erreur ?? `Erreur ${res.status}`);
  }
}

export interface SyncResult {
  succes: number;
  echecs: number;
}

interface OfflineContextValue {
  isOnline: boolean;
  pendingPhotoCount: number;
  syncStatus: "idle" | "syncing" | "done" | "error";
  syncResult: SyncResult | null;
  triggerSync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  pendingPhotoCount: 0,
  syncStatus: "idle",
  syncResult: null,
  triggerSync: async () => {},
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline]             = useState(navigator.onLine);
  const [pendingPhotoCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus]          = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncResult, setSyncResult]          = useState<SyncResult | null>(null);
  const syncingRef    = useRef(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCount = useCallback(async () => {
    const pending = await hasPendingPhoto();
    setPendingCount(pending ? 1 : 0);
  }, []);

  const triggerSync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    const photo = await getLatestPendingPhoto();
    if (!photo) return;

    syncingRef.current = true;
    setSyncStatus("syncing");
    setSyncResult(null);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

    let nbSucces = 0;
    let nbEchecs = 0;

    try {
      try {
        await uploadPhotoApi(photo.dataUrl);
        await markPhotoSynced(photo.localId);
        nbSucces = 1;
      } catch (err) {
        const t = await incrementPhotoTentatives(photo.localId);
        if (t >= 3) {
          await markPhotoError(photo.localId, `Échec définitif : ${(err as Error).message}`);
        }
        nbEchecs = 1;
      }

      await refreshCount();
      setSyncResult({ succes: nbSucces, echecs: nbEchecs });
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

  useEffect(() => {
    function onOnline()  { setIsOnline(true);  triggerSync(); }
    function onOffline() { setIsOnline(false); }
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [triggerSync]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) triggerSync();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [triggerSync]);

  useEffect(() => {
    hasPendingPhoto().then((pending) => {
      setPendingCount(pending ? 1 : 0);
      if (pending && navigator.onLine) triggerSync();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OfflineContext.Provider value={{ isOnline, pendingPhotoCount, syncStatus, syncResult, triggerSync }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}

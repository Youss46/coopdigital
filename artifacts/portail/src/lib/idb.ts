export interface PendingPhoto {
  localId: string;
  dataUrl: string;
  timestamp: number;
  status: "pending" | "synced" | "error";
  errorMsg?: string;
  syncedAt?: number;
  tentatives?: number;
}

const DB_NAME = "coopdigital-portail";
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("pending_photos")) {
        const store = db.createObjectStore("pending_photos", { keyPath: "localId" });
        store.createIndex("status", "status");
      }
    };

    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror  = () => reject(req.error);
  });
}

function tx(storeName: string, mode: IDBTransactionMode, db: IDBDatabase) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function queuePhoto(localId: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_photos", "readwrite", db);
    const record: PendingPhoto = { localId, dataUrl, timestamp: Date.now(), status: "pending" };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  });
}

export async function getLatestPendingPhoto(): Promise<PendingPhoto | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_photos", "readonly", db);
    const idx = store.index("status");
    const req = idx.getAll("pending");
    req.onsuccess = () => {
      const list = (req.result as PendingPhoto[]).sort((a, b) => b.timestamp - a.timestamp);
      resolve(list[0] ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function hasPendingPhoto(): Promise<boolean> {
  const p = await getLatestPendingPhoto();
  return p !== null;
}

export async function markPhotoSynced(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_photos", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const p = getReq.result as PendingPhoto;
      if (p) {
        p.status   = "synced";
        p.syncedAt = Date.now();
        const putReq = store.put(p);
        putReq.onsuccess = () => resolve();
        putReq.onerror   = () => reject(putReq.error);
      } else resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function markPhotoError(localId: string, erreur: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_photos", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const p = getReq.result as PendingPhoto;
      if (p) {
        p.status   = "error";
        p.errorMsg = erreur;
        const putReq = store.put(p);
        putReq.onsuccess = () => resolve();
        putReq.onerror   = () => reject(putReq.error);
      } else resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function incrementPhotoTentatives(localId: string): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_photos", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const p = getReq.result as PendingPhoto | undefined;
      if (p) {
        const next = (p.tentatives ?? 0) + 1;
        p.tentatives = next;
        const putReq = store.put(p);
        putReq.onsuccess = () => resolve(next);
        putReq.onerror   = () => reject(putReq.error);
      } else resolve(0);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

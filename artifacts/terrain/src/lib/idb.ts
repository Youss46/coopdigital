import type { PendingOp, CollecteInput, PaiementInput, AvanceInput, GpsCollecteInput, PrixActuel, Fournisseur } from "./types";

export type PendingOpType = "collecte" | "paiement" | "avance" | "gps_collecte";

const DB_NAME = "coopdigital-terrain";
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("pending_ops")) {
        const store = db.createObjectStore("pending_ops", { keyPath: "localId" });
        store.createIndex("status", "status");
        store.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

function tx(storeName: string, mode: IDBTransactionMode, db: IDBDatabase) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function queueOp(op: {
  type: PendingOpType;
  data: CollecteInput | PaiementInput | AvanceInput | GpsCollecteInput;
  localId: string;
}): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readwrite", db);
    const record: PendingOp = {
      ...op,
      timestamp: Date.now(),
      status: "pending",
    };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingOps(): Promise<PendingOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readonly", db);
    const idx = store.index("status");
    const req = idx.getAll("pending");
    req.onsuccess = () => {
      const results = (req.result as PendingOp[]).sort((a, b) => a.timestamp - b.timestamp);
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const ops = await getPendingOps();
  return ops.length;
}

export async function markOpSynced(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as PendingOp;
      if (op) {
        op.status = "synced";
        const putReq = store.put(op);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function markOpError(localId: string, erreur: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as PendingOp;
      if (op) {
        op.status = "error";
        op.errorMsg = erreur;
        const putReq = store.put(op);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function setCache(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("cache", "readwrite", db);
    const req = store.put({ key, value, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getCache<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("cache", "readonly", db);
    const req = store.get(key);
    req.onsuccess = () => {
      const record = req.result as { key: string; value: T } | undefined;
      resolve(record ? record.value : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function cacheFournisseurs(fournisseurs: Fournisseur[]): Promise<void> {
  await setCache("fournisseurs", fournisseurs);
}

export async function getCachedFournisseurs(): Promise<Fournisseur[]> {
  return (await getCache<Fournisseur[]>("fournisseurs")) ?? [];
}

export async function cachePrix(prix: PrixActuel): Promise<void> {
  await setCache("prix", prix);
}

export async function getCachedPrix(): Promise<PrixActuel | null> {
  return getCache<PrixActuel>("prix");
}

export async function incrementTentatives(localId: string): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as PendingOp | undefined;
      if (op) {
        const next = (op.tentatives ?? 0) + 1;
        op.tentatives = next;
        const putReq = store.put(op);
        putReq.onsuccess = () => resolve(next);
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve(0);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function markOpSyncedWithTs(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as PendingOp;
      if (op) {
        op.status = "synced";
        op.syncedAt = Date.now();
        const putReq = store.put(op);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function getAllOps(): Promise<PendingOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readonly", db);
    const req = store.getAll();
    req.onsuccess = () => {
      const results = (req.result as PendingOp[]).sort((a, b) => b.timestamp - a.timestamp);
      resolve(results.slice(0, 50));
    };
    req.onerror = () => reject(req.error);
  });
}

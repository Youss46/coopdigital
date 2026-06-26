export type AdminOpType = "livraison" | "avance" | "remboursement";

export interface LivraisonData {
  membreId: number;
  poidsKg: number;
  prixUnitaireFcfa: number;
  dateLivraison: string;
  modePaiement: "orange_money" | "mtn_momo" | "especes" | "wave" | "cheque" | "differe";
  campagneId: number | null;
  nombreSacs?: number | null;
  retenueKg?: number | null;
  sectionLivraison?: string | null;
  entrepotId?: number | null;
  entrepotDelegueId?: number | null;
  datePaiementPrevue?: string;
}

export interface AvanceData {
  membreId: number;
  montantOctroyeFcfa: number;
  dateOctroi: string;
  dateEcheance?: string;
  motif?: string;
}

export interface RemboursementData {
  avanceId: number;
  montantFcfa: number;
}

export interface PendingAdminOp {
  localId: string;
  type: AdminOpType;
  data: LivraisonData | AvanceData | RemboursementData;
  timestamp: number;
  status: "pending" | "synced" | "error";
  errorMsg?: string;
  syncedAt?: number;
  tentatives?: number;
}

const DB_NAME = "coopdigital-admin";
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
    };

    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror  = () => reject(req.error);
  });
}

function tx(storeName: string, mode: IDBTransactionMode, db: IDBDatabase) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function queueOp(op: {
  localId: string;
  type: AdminOpType;
  data: LivraisonData | AvanceData | RemboursementData;
}): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readwrite", db);
    const record: PendingAdminOp = { ...op, timestamp: Date.now(), status: "pending" };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  });
}

export async function getPendingOps(): Promise<PendingAdminOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readonly", db);
    const idx = store.index("status");
    const req = idx.getAll("pending");
    req.onsuccess = () => {
      const results = (req.result as PendingAdminOp[]).sort((a, b) => a.timestamp - b.timestamp);
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllOps(): Promise<PendingAdminOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readonly", db);
    const req = store.getAll();
    req.onsuccess = () => {
      const results = (req.result as PendingAdminOp[]).sort((a, b) => b.timestamp - a.timestamp);
      resolve(results.slice(0, 50));
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
      const op = getReq.result as PendingAdminOp;
      if (op) {
        op.status  = "synced";
        op.syncedAt = Date.now();
        const putReq = store.put(op);
        putReq.onsuccess = () => resolve();
        putReq.onerror   = () => reject(putReq.error);
      } else resolve();
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
      const op = getReq.result as PendingAdminOp;
      if (op) {
        op.status   = "error";
        op.errorMsg = erreur;
        const putReq = store.put(op);
        putReq.onsuccess = () => resolve();
        putReq.onerror   = () => reject(putReq.error);
      } else resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deleteOp(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readwrite", db);
    const req = store.delete(localId);
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  });
}

export async function incrementTentatives(localId: string): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_ops", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as PendingAdminOp | undefined;
      if (op) {
        const next = (op.tentatives ?? 0) + 1;
        op.tentatives = next;
        const putReq = store.put(op);
        putReq.onsuccess = () => resolve(next);
        putReq.onerror   = () => reject(putReq.error);
      } else resolve(0);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

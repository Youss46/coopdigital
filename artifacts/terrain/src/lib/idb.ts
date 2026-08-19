import type { PendingOp, CollecteInput, PaiementInput, AvanceInput, GpsCollecteInput, PrixActuel, Fournisseur, MissionTerrain, MissionDetail, EnqueteOp, BrouillonLigne, BrouillonPesee } from "./types";

export interface GpsOp {
  localId: string;
  missionId: number;
  membreId: number;
  data: Omit<GpsCollecteInput, "missionId" | "membreId" | "localId">;
  timestamp: number;
  status: "pending" | "synced" | "error";
  tentatives?: number;
}

export type PendingOpType = "collecte" | "paiement" | "avance" | "gps_collecte";

const DB_NAME = "coopdigital-terrain";
const DB_VERSION = 5;

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
      if (!db.objectStoreNames.contains("missions_cache")) {
        db.createObjectStore("missions_cache", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pending_gps")) {
        const gpsStore = db.createObjectStore("pending_gps", { keyPath: "localId" });
        gpsStore.createIndex("status", "status");
      }
      if (!db.objectStoreNames.contains("pending_enquetes")) {
        const enqStore = db.createObjectStore("pending_enquetes", { keyPath: "localId" });
        enqStore.createIndex("status", "status");
        enqStore.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains("pesee_brouillons")) {
        const brouStore = db.createObjectStore("pesee_brouillons", { keyPath: "localId" });
        brouStore.createIndex("syncStatus", "syncStatus");
        brouStore.createIndex("statut", "statut");
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
  const [regularOps, gpsOps, enqOps, brouillons] = await Promise.all([
    getPendingOps(), getPendingGpsOps(), getPendingEnqueteOps(), getPendingBrouillons(),
  ]);
  return regularOps.length + gpsOps.length + enqOps.length + brouillons.length;
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

export async function queueGpsOp(op: Omit<GpsOp, "timestamp" | "status">): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_gps", "readwrite", db);
    const record: GpsOp = { ...op, timestamp: Date.now(), status: "pending" };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingGpsOps(): Promise<GpsOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_gps", "readonly", db);
    const idx = store.index("status");
    const req = idx.getAll("pending");
    req.onsuccess = () => resolve((req.result as GpsOp[]).sort((a, b) => a.timestamp - b.timestamp));
    req.onerror = () => reject(req.error);
  });
}

export async function markGpsOpSynced(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_gps", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as GpsOp;
      if (op) { op.status = "synced"; const p = store.put(op); p.onsuccess = () => resolve(); p.onerror = () => reject(p.error); }
      else resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function markGpsOpError(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_gps", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as GpsOp;
      if (op) { op.status = "error"; const p = store.put(op); p.onsuccess = () => resolve(); p.onerror = () => reject(p.error); }
      else resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function incrementGpsTentatives(localId: string): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_gps", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as GpsOp | undefined;
      if (op) {
        const next = (op.tentatives ?? 0) + 1;
        op.tentatives = next;
        const p = store.put(op); p.onsuccess = () => resolve(next); p.onerror = () => reject(p.error);
      } else resolve(0);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function cacheMissionDetail(detail: MissionDetail): Promise<void> {
  await setCache(`mission_detail_${detail.id}`, detail);
}

export async function getCachedMissionDetail(id: number): Promise<MissionDetail | null> {
  return getCache<MissionDetail>(`mission_detail_${id}`);
}

export async function cacheMissions(missions: MissionTerrain[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("missions_cache", "readwrite");
    const store = transaction.objectStore("missions_cache");
    store.clear();
    missions.forEach((m) => store.put(m));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getCachedMissions(): Promise<MissionTerrain[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("missions_cache", "readonly", db);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as MissionTerrain[]);
    req.onerror = () => reject(req.error);
  });
}

// ─── Pending enquête ops ───────────────────────────────────────────────────────

export async function queueEnqueteOp(op: Omit<EnqueteOp, "timestamp" | "status">): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_enquetes", "readwrite", db);
    const record: EnqueteOp = { ...op, timestamp: Date.now(), status: "pending" };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingEnqueteOps(): Promise<EnqueteOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_enquetes", "readonly", db);
    const idx = store.index("status");
    const req = idx.getAll("pending");
    req.onsuccess = () => resolve((req.result as EnqueteOp[]).sort((a, b) => a.timestamp - b.timestamp));
    req.onerror = () => reject(req.error);
  });
}

export async function getAllEnqueteOps(): Promise<EnqueteOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_enquetes", "readonly", db);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as EnqueteOp[]).sort((a, b) => b.timestamp - a.timestamp).slice(0, 50));
    req.onerror = () => reject(req.error);
  });
}

export async function markEnqueteOpSynced(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_enquetes", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as EnqueteOp;
      if (op) { op.status = "synced"; op.syncedAt = Date.now(); const p = store.put(op); p.onsuccess = () => resolve(); p.onerror = () => reject(p.error); }
      else resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function markEnqueteOpError(localId: string, erreur: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_enquetes", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as EnqueteOp;
      if (op) { op.status = "error"; op.errorMsg = erreur; const p = store.put(op); p.onsuccess = () => resolve(); p.onerror = () => reject(p.error); }
      else resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function incrementEnqueteTentatives(localId: string): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pending_enquetes", "readwrite", db);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const op = getReq.result as EnqueteOp | undefined;
      if (op) {
        const next = (op.tentatives ?? 0) + 1;
        op.tentatives = next;
        const p = store.put(op); p.onsuccess = () => resolve(next); p.onerror = () => reject(p.error);
      } else resolve(0);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ─── Brouillons de pesée hors-ligne ──────────────────────────────────────────

export async function createBrouillon(data: {
  membreId: number;
  membreNom: string;
  membrePrenoms: string;
  membreCode: string;
  produit: string;
  operation: string;
  certificationCacao: string;
}): Promise<BrouillonPesee> {
  const db = await openDb();
  const now = Date.now();
  const brouillon: BrouillonPesee = {
    localId: crypto.randomUUID(),
    ...data,
    statut: "en_cours",
    syncStatus: "pending",
    lignes: [],
    poidsTotalKg: 0,
    nbSacsTotal: 0,
    createdAt: now,
    updatedAt: now,
  };
  return new Promise((resolve, reject) => {
    const store = tx("pesee_brouillons", "readwrite", db);
    const req = store.put(brouillon);
    req.onsuccess = () => resolve(brouillon);
    req.onerror = () => reject(req.error);
  });
}

export async function getBrouillons(): Promise<BrouillonPesee[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pesee_brouillons", "readonly", db);
    const req = store.getAll();
    req.onsuccess = () => {
      const results = (req.result as BrouillonPesee[]).sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getBrouillon(localId: string): Promise<BrouillonPesee | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pesee_brouillons", "readonly", db);
    const req = store.get(localId);
    req.onsuccess = () => resolve((req.result as BrouillonPesee | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveBrouillon(brouillon: BrouillonPesee): Promise<BrouillonPesee> {
  const db = await openDb();
  const updated = { ...brouillon, updatedAt: Date.now() };
  return new Promise((resolve, reject) => {
    const store = tx("pesee_brouillons", "readwrite", db);
    const req = store.put(updated);
    req.onsuccess = () => resolve(updated);
    req.onerror = () => reject(req.error);
  });
}

export async function addLigneToBrouillon(
  localId: string,
  ligne: { nbSacs: number; poidsBrutKg: number; tareKg: number; notes?: string },
): Promise<BrouillonPesee> {
  const brouillon = await getBrouillon(localId);
  if (!brouillon) throw new Error("Brouillon introuvable");
  const newLigne: BrouillonLigne = {
    localId: crypto.randomUUID(),
    nbSacs: ligne.nbSacs,
    poidsBrutKg: ligne.poidsBrutKg,
    tareKg: ligne.tareKg,
    notes: ligne.notes,
    numeroPassage: brouillon.lignes.length + 1,
    timestamp: Date.now(),
  };
  const lignes = [...brouillon.lignes, newLigne];
  const poidsTotalKg = lignes.reduce((acc, l) => acc + Math.max(0, l.poidsBrutKg - l.tareKg), 0);
  const nbSacsTotal = lignes.reduce((acc, l) => acc + l.nbSacs, 0);
  return saveBrouillon({ ...brouillon, lignes, poidsTotalKg, nbSacsTotal });
}

export async function deleteLigneFromBrouillon(localId: string, ligneLocalId: string): Promise<BrouillonPesee> {
  const brouillon = await getBrouillon(localId);
  if (!brouillon) throw new Error("Brouillon introuvable");
  const lignes = brouillon.lignes
    .filter((l) => l.localId !== ligneLocalId)
    .map((l, idx) => ({ ...l, numeroPassage: idx + 1 }));
  const poidsTotalKg = lignes.reduce((acc, l) => acc + Math.max(0, l.poidsBrutKg - l.tareKg), 0);
  const nbSacsTotal = lignes.reduce((acc, l) => acc + l.nbSacs, 0);
  return saveBrouillon({ ...brouillon, lignes, poidsTotalKg, nbSacsTotal });
}

export async function terminerBrouillon(localId: string): Promise<BrouillonPesee> {
  const brouillon = await getBrouillon(localId);
  if (!brouillon) throw new Error("Brouillon introuvable");
  if (brouillon.lignes.length === 0) throw new Error("Aucune pesée enregistrée dans ce brouillon");
  return saveBrouillon({ ...brouillon, statut: "terminee" });
}

export async function annulerBrouillon(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx("pesee_brouillons", "readwrite", db);
    const req = store.delete(localId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function markBrouillonSynced(localId: string, serverId: number, numeroSession: string): Promise<void> {
  const brouillon = await getBrouillon(localId);
  if (!brouillon) return;
  await saveBrouillon({ ...brouillon, syncStatus: "synced", serverId, numeroSession });
}

export async function markBrouillonError(localId: string, errorMsg: string): Promise<void> {
  const brouillon = await getBrouillon(localId);
  if (!brouillon) return;
  await saveBrouillon({ ...brouillon, syncStatus: "error", errorMsg });
}

/** Retourne les brouillons terminés et non encore synchronisés. */
export async function getPendingBrouillons(): Promise<BrouillonPesee[]> {
  const all = await getBrouillons();
  return all.filter((b) => b.statut === "terminee" && b.syncStatus === "pending");
}

// ─── Cache missions d'enquête ──────────────────────────────────────────────────

export async function cacheEnquetes(enquetes: import("./types").MissionEnquete[]): Promise<void> {
  await setCache("enquetes_list", enquetes);
}

export async function getCachedEnquetes(): Promise<import("./types").MissionEnquete[]> {
  return (await getCache<import("./types").MissionEnquete[]>("enquetes_list")) ?? [];
}

// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createBrouillon,
  getAllOps,
  markBrouillonError,
  markEnqueteOpError,
  queueEnqueteOp,
  queueOp,
} from "./idb";

const DB_NAME = "coopdigital-terrain";
const STORE_NAMES = [
  "pending_ops",
  "pending_gps",
  "pending_enquetes",
  "pesee_brouillons",
] as const;

describe("historique offline multi-files", () => {
  beforeEach(async () => {
    await clearOfflineStores();
  });

  it("réhydrate simultanément une enquête et un brouillon avec leurs identifiants et statuts", async () => {
    await queueEnqueteOp({
      localId: "enquete-local-1",
      missionId: 14,
      membreId: 27,
      reponses: {
        certification: { valeur: "oui", commentaire: "Document vérifié" },
      },
      notesAgent: "À revoir au prochain passage",
    });
    const brouillon = await createBrouillon({
      membreId: 31,
      membreNom: "Kouamé",
      membrePrenoms: "Aïcha",
      membreCode: "MEM-031",
      produit: "Cacao",
      operation: "reception",
      certificationCacao: "RA",
    });

    const historique = await getAllOps();

    expect(historique).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          localId: "enquete-local-1",
          type: "enquete",
          status: "pending",
        }),
        expect.objectContaining({
          localId: brouillon.localId,
          type: "pesee_brouillon",
          status: "pending",
          data: expect.objectContaining({ statut: "en_cours" }),
        }),
      ]),
    );
  });

  it("conserve les erreurs de chaque file et trie les entrées par date décroissante", async () => {
    const dateNow = Date.now;
    let currentDate = 1_000;
    Date.now = () => currentDate;
    try {
      await queueEnqueteOp({
        localId: "enquete-ancienne",
        missionId: 1,
        membreId: 2,
        reponses: {},
      });

      currentDate = 2_000;
      await queueOp({
        type: "collecte",
        localId: "collecte-milieu",
        data: { membreId: 2, nombreSacs: 3, poidsBrutKg: 150, retenueKg: 2 },
      });

      currentDate = 3_000;
      const brouillon = await createBrouillon({
        membreId: 3,
        membreNom: "Koffi",
        membrePrenoms: "Yao",
        membreCode: "MEM-003",
        produit: "Cacao",
        operation: "reception",
        certificationCacao: "ORDINAIRE",
      });

      await markEnqueteOpError("enquete-ancienne", "Réponse invalide");
      await markBrouillonError(brouillon.localId, "Synchronisation refusée");

      const historique = await getAllOps();

      expect(historique.map((op) => op.localId)).toEqual([
        brouillon.localId,
        "collecte-milieu",
        "enquete-ancienne",
      ]);
      expect(historique.find((op) => op.localId === "enquete-ancienne")).toMatchObject({
        status: "error",
        errorMsg: "Réponse invalide",
      });
      expect(historique.find((op) => op.localId === brouillon.localId)).toMatchObject({
        status: "error",
        errorMsg: "Synchronisation refusée",
      });
    } finally {
      Date.now = dateNow;
    }
  });
});

async function clearOfflineStores(): Promise<void> {
  const request = indexedDB.open(DB_NAME, 5);
  request.onupgradeneeded = () => {
    const db = request.result;
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
      const store = db.createObjectStore("pending_gps", { keyPath: "localId" });
      store.createIndex("status", "status");
    }
    if (!db.objectStoreNames.contains("pending_enquetes")) {
      const store = db.createObjectStore("pending_enquetes", { keyPath: "localId" });
      store.createIndex("status", "status");
      store.createIndex("timestamp", "timestamp");
    }
    if (!db.objectStoreNames.contains("pesee_brouillons")) {
      const store = db.createObjectStore("pesee_brouillons", { keyPath: "localId" });
      store.createIndex("syncStatus", "syncStatus");
      store.createIndex("statut", "statut");
    }
  };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([...STORE_NAMES], "readwrite");
    for (const storeName of STORE_NAMES) {
      transaction.objectStore(storeName).clear();
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}
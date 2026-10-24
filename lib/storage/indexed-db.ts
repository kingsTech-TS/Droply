// Minimal promise wrapper around IndexedDB. Everything degrades to "not available" rather
// than throwing, because private windows and some embedded browsers block storage.

export const DB_NAME = "droply";
export const DB_VERSION = 2;
export const STORE_LEGS = "legs";
export const STORE_DIGESTS = "digests";
export const STORE_CHUNKS = "chunks";
/** Small settings that must live in IndexedDB (e.g. the Droply folder's handle). */
export const STORE_SETTINGS = "settings";

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

export function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_LEGS)) {
        const legs = db.createObjectStore(STORE_LEGS, { keyPath: "key" });
        legs.createIndex("roomId", "roomId");
      }
      // Key: [role, transferId, index] → hex digest.
      if (!db.objectStoreNames.contains(STORE_DIGESTS)) db.createObjectStore(STORE_DIGESTS);
      // Key: [transferId, index] → Blob (only for the IndexedDB storage tier).
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) db.createObjectStore(STORE_CHUNKS);
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

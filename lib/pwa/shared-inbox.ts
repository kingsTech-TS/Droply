// Files and text shared to Droply from another app (PWA Share Target). The service worker
// receives the share, stores it here (IndexedDB, on this device only) and opens the app,
// which then picks it up. Nothing is uploaded.

export const SHARE_DB = "droply-share";
export const SHARE_STORE = "inbox";
export const SHARE_KEY = "latest";

export interface SharedPayload {
  files: File[];
  text: string | null;
  at: number;
}

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SHARE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/** Reads and removes what was shared (once). */
export async function takeSharedPayload(): Promise<SharedPayload | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(SHARE_STORE, "readwrite");
    const store = tx.objectStore(SHARE_STORE);
    const get = store.get(SHARE_KEY);
    get.onsuccess = () => {
      const value: unknown = get.result;
      store.delete(SHARE_KEY);
      if (!value || typeof value !== "object") return resolve(null);
      const v = value as { files?: unknown; text?: unknown; at?: unknown };
      const files = Array.isArray(v.files) ? v.files.filter((f): f is File => f instanceof File) : [];
      const text = typeof v.text === "string" && v.text.trim() ? v.text : null;
      // Shares older than 10 minutes were abandoned.
      if (typeof v.at !== "number" || Date.now() - v.at > 10 * 60_000) return resolve(null);
      resolve({ files, text, at: v.at });
    };
    get.onerror = () => resolve(null);
  });
}

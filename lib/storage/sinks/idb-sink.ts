import { openDb, requestToPromise, STORE_CHUNKS, transactionDone } from "../indexed-db";
import type { ChunkSink } from "./sink";

/**
 * Fallback tier: one Blob per chunk in IndexedDB. Browsers keep these Blobs on disk, and the
 * final File is assembled from them without concatenating bytes in memory.
 */
export class IdbSink implements ChunkSink {
  readonly kind = "idb" as const;

  constructor(
    private readonly transferId: string,
    private readonly totalChunks: number,
  ) {}

  static async isAvailable(): Promise<boolean> {
    return (await openDb()) !== null;
  }

  async write(index: number, _offset: number, data: Uint8Array): Promise<void> {
    const db = await openDb();
    if (!db) throw new Error("IndexedDB unavailable");
    const tx = db.transaction(STORE_CHUNKS, "readwrite");
    tx.objectStore(STORE_CHUNKS).put(new Blob([data as Uint8Array<ArrayBuffer>]), [this.transferId, index]);
    await transactionDone(tx);
  }

  async finalize(): Promise<File> {
    const db = await openDb();
    if (!db) throw new Error("IndexedDB unavailable");
    const tx = db.transaction(STORE_CHUNKS, "readonly");
    const range = IDBKeyRange.bound([this.transferId, 0], [this.transferId, Number.MAX_SAFE_INTEGER]);
    const store = tx.objectStore(STORE_CHUNKS);
    const [keys, values] = await Promise.all([
      requestToPromise(store.getAllKeys(range)),
      requestToPromise(store.getAll(range)),
    ]);
    const parts: Blob[] = new Array(this.totalChunks);
    keys.forEach((key, i) => {
      const index = Array.isArray(key) ? key[1] : undefined;
      const value: unknown = values[i];
      if (typeof index === "number" && value instanceof Blob) parts[index] = value;
    });
    for (let i = 0; i < this.totalChunks; i += 1) {
      if (!parts[i]) throw new Error(`chunk ${i} missing`);
    }
    return new File(parts, "download", { type: "application/octet-stream" });
  }

  async close(): Promise<void> {}

  async discard(): Promise<void> {
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction(STORE_CHUNKS, "readwrite");
    tx.objectStore(STORE_CHUNKS).delete(
      IDBKeyRange.bound([this.transferId, 0], [this.transferId, Number.MAX_SAFE_INTEGER]),
    );
    await transactionDone(tx);
  }
}

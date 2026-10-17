// Persists what is needed to resume a transfer after a disconnect or a reload: leg
// metadata and the digest of every verified chunk. A digest is written only after its chunk
// is stored, so "digest present" means "chunk verified and on disk". Payloads are never
// stored here (except by the IndexedDB storage tier, which keeps its own chunks).
import {
  openDb,
  requestToPromise,
  STORE_CHUNKS,
  STORE_DIGESTS,
  STORE_LEGS,
  transactionDone,
} from "@/lib/storage/indexed-db";
import { logger } from "@/lib/utils/logger";
import type { SinkKind } from "@/lib/storage/sinks/sink";

export type LegRole = "send" | "receive";

export interface LegRecord {
  key: string;
  role: LegRole;
  transferId: string;
  roomId: string;
  peerId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  /** Receiver only: where the chunks are stored. */
  sinkKind: SinkKind | null;
  /** Sender only: used to check that a re-selected file is the same one. */
  lastModified: number | null;
  createdAt: number;
  updatedAt: number;
}

export function legKey(role: LegRole, transferId: string): string {
  return `${role}:${transferId}`;
}

export interface ResumeStore {
  saveLeg(record: LegRecord): Promise<void>;
  getLeg(role: LegRole, transferId: string): Promise<LegRecord | null>;
  legsForRoom(roomId: string): Promise<LegRecord[]>;
  allLegs(): Promise<LegRecord[]>;
  putDigest(role: LegRole, transferId: string, index: number, digest: string): Promise<void>;
  getDigests(role: LegRole, transferId: string): Promise<Map<number, string>>;
  deleteLeg(role: LegRole, transferId: string): Promise<void>;
}

/** Used in tests and when IndexedDB is unavailable: resume works within the page only. */
export class MemoryResumeStore implements ResumeStore {
  private readonly legs = new Map<string, LegRecord>();
  private readonly digests = new Map<string, Map<number, string>>();

  async saveLeg(record: LegRecord): Promise<void> {
    this.legs.set(record.key, { ...record });
  }
  async getLeg(role: LegRole, transferId: string): Promise<LegRecord | null> {
    return this.legs.get(legKey(role, transferId)) ?? null;
  }
  async legsForRoom(roomId: string): Promise<LegRecord[]> {
    return [...this.legs.values()].filter((l) => l.roomId === roomId);
  }
  async allLegs(): Promise<LegRecord[]> {
    return [...this.legs.values()];
  }
  async putDigest(role: LegRole, transferId: string, index: number, digest: string): Promise<void> {
    const key = legKey(role, transferId);
    let map = this.digests.get(key);
    if (!map) {
      map = new Map();
      this.digests.set(key, map);
    }
    map.set(index, digest);
  }
  async getDigests(role: LegRole, transferId: string): Promise<Map<number, string>> {
    return new Map(this.digests.get(legKey(role, transferId)) ?? []);
  }
  async deleteLeg(role: LegRole, transferId: string): Promise<void> {
    this.legs.delete(legKey(role, transferId));
    this.digests.delete(legKey(role, transferId));
  }
}

export class IdbResumeStore implements ResumeStore {
  private readonly fallback = new MemoryResumeStore();

  private async db(): Promise<IDBDatabase | null> {
    return openDb();
  }

  async saveLeg(record: LegRecord): Promise<void> {
    const db = await this.db();
    if (!db) return this.fallback.saveLeg(record);
    try {
      const tx = db.transaction(STORE_LEGS, "readwrite");
      tx.objectStore(STORE_LEGS).put(record);
      await transactionDone(tx);
    } catch (error) {
      logger.warn("resume", "saveLeg failed", String(error));
    }
  }

  async getLeg(role: LegRole, transferId: string): Promise<LegRecord | null> {
    const db = await this.db();
    if (!db) return this.fallback.getLeg(role, transferId);
    try {
      const tx = db.transaction(STORE_LEGS, "readonly");
      const value = await requestToPromise(tx.objectStore(STORE_LEGS).get(legKey(role, transferId)));
      return (value as LegRecord | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async legsForRoom(roomId: string): Promise<LegRecord[]> {
    const db = await this.db();
    if (!db) return this.fallback.legsForRoom(roomId);
    try {
      const tx = db.transaction(STORE_LEGS, "readonly");
      const index = tx.objectStore(STORE_LEGS).index("roomId");
      return (await requestToPromise(index.getAll(roomId))) as LegRecord[];
    } catch {
      return [];
    }
  }

  async allLegs(): Promise<LegRecord[]> {
    const db = await this.db();
    if (!db) return this.fallback.allLegs();
    try {
      const tx = db.transaction(STORE_LEGS, "readonly");
      return (await requestToPromise(tx.objectStore(STORE_LEGS).getAll())) as LegRecord[];
    } catch {
      return [];
    }
  }

  async putDigest(role: LegRole, transferId: string, index: number, digest: string): Promise<void> {
    const db = await this.db();
    if (!db) return this.fallback.putDigest(role, transferId, index, digest);
    const tx = db.transaction(STORE_DIGESTS, "readwrite");
    tx.objectStore(STORE_DIGESTS).put(digest, [role, transferId, index]);
    await transactionDone(tx);
  }

  async getDigests(role: LegRole, transferId: string): Promise<Map<number, string>> {
    const db = await this.db();
    if (!db) return this.fallback.getDigests(role, transferId);
    const out = new Map<number, string>();
    try {
      const tx = db.transaction(STORE_DIGESTS, "readonly");
      const range = IDBKeyRange.bound([role, transferId, 0], [role, transferId, Number.MAX_SAFE_INTEGER]);
      const store = tx.objectStore(STORE_DIGESTS);
      const [keys, values] = await Promise.all([
        requestToPromise(store.getAllKeys(range)),
        requestToPromise(store.getAll(range)),
      ]);
      keys.forEach((key, i) => {
        const index = Array.isArray(key) ? key[2] : undefined;
        const value: unknown = values[i];
        if (typeof index === "number" && typeof value === "string") out.set(index, value);
      });
    } catch (error) {
      logger.warn("resume", "getDigests failed", String(error));
    }
    return out;
  }

  async deleteLeg(role: LegRole, transferId: string): Promise<void> {
    const db = await this.db();
    if (!db) return this.fallback.deleteLeg(role, transferId);
    try {
      const tx = db.transaction([STORE_LEGS, STORE_DIGESTS, STORE_CHUNKS], "readwrite");
      tx.objectStore(STORE_LEGS).delete(legKey(role, transferId));
      tx.objectStore(STORE_DIGESTS).delete(
        IDBKeyRange.bound([role, transferId, 0], [role, transferId, Number.MAX_SAFE_INTEGER]),
      );
      if (role === "receive") {
        tx.objectStore(STORE_CHUNKS).delete(
          IDBKeyRange.bound([transferId, 0], [transferId, Number.MAX_SAFE_INTEGER]),
        );
      }
      await transactionDone(tx);
    } catch (error) {
      logger.warn("resume", "deleteLeg failed", String(error));
    }
  }
}

export function createResumeStore(): ResumeStore {
  return typeof indexedDB === "undefined" ? new MemoryResumeStore() : new IdbResumeStore();
}

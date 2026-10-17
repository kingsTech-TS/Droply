// Picks where an incoming file is stored, best tier first:
//   direct-to-disk (a folder the user chose) → OPFS → IndexedDB → memory (small files only).
import { estimateStorage } from "../quota";
import { FsAccessSink, type DirectoryHandleLike } from "./fs-access-sink";
import { IdbSink } from "./idb-sink";
import { MemorySink } from "./memory-sink";
import { OpfsSink } from "./opfs-sink";
import { MEMORY_SINK_LIMIT, type ChunkSink, type SinkKind } from "./sink";

export interface SinkRequest {
  transferId: string;
  fileName: string;
  size: number;
  totalChunks: number;
  /** A folder the user picked for direct-to-disk saving, if any. */
  directory?: DirectoryHandleLike | null;
  /** Reopen this tier (resume after reload). */
  preferredKind?: SinkKind | null;
}

export class NoStorageError extends Error {
  override readonly name = "NoStorageError";
}

export interface SinkFactory {
  create(request: SinkRequest): Promise<ChunkSink>;
  /** Whether `bytes` fit in temporary browser storage (null = unknown). */
  fits(bytes: number): Promise<boolean | null>;
}

export const browserSinkFactory: SinkFactory = {
  async create(request) {
    const { transferId, fileName, size, totalChunks, directory, preferredKind } = request;
    if (directory) return new FsAccessSink(directory, fileName);
    if (preferredKind !== "idb" && preferredKind !== "memory" && (await OpfsSink.isAvailable())) {
      return new OpfsSink(transferId, size);
    }
    if (preferredKind !== "memory" && (await IdbSink.isAvailable())) {
      return new IdbSink(transferId, totalChunks);
    }
    if (size <= MEMORY_SINK_LIMIT) return new MemorySink(totalChunks);
    throw new NoStorageError("This browser has no storage for a file this large.");
  },
  async fits(bytes) {
    const { available } = await estimateStorage();
    return available === null ? null : available > bytes * 1.05;
  },
};

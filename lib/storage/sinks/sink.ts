// Where received chunks are written. Each chunk is written at its byte offset, so chunks can
// arrive in any order and a resumed transfer fills only the gaps.

export type SinkKind = "fs-access" | "opfs" | "idb" | "memory";

export interface ChunkSink {
  readonly kind: SinkKind;
  /**
   * Writes one verified chunk at `offset`. The sink takes ownership of `data`: it may detach
   * its buffer (e.g. transfer it to a worker), so the caller must not use it afterwards.
   */
  write(index: number, offset: number, data: Uint8Array): Promise<void>;
  /**
   * Finishes the file. Returns the assembled file to save, or null if it is already in its
   * final place on the user's disk (direct-to-disk).
   */
  finalize(): Promise<File | null>;
  /** Releases handles but keeps the data (pause, page hide). */
  close(): Promise<void>;
  /** Deletes all temporary data. */
  discard(): Promise<void>;
}

/** Above this, the memory tier is refused: it would risk crashing the tab. */
export const MEMORY_SINK_LIMIT = 256 * 1024 * 1024;

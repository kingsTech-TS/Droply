import type { ChunkSink } from "./sink";

/** Last resort for small files. Each chunk becomes a Blob, so no giant array is ever built. */
export class MemorySink implements ChunkSink {
  readonly kind = "memory" as const;
  private parts = new Map<number, Blob>();

  constructor(private readonly totalChunks: number) {}

  async write(index: number, _offset: number, data: Uint8Array): Promise<void> {
    // Blob copies the bytes, so the caller may reuse `data`.
    this.parts.set(index, new Blob([data as Uint8Array<ArrayBuffer>]));
  }

  async finalize(): Promise<File> {
    const ordered: Blob[] = [];
    for (let i = 0; i < this.totalChunks; i += 1) {
      const part = this.parts.get(i);
      if (!part) throw new Error(`chunk ${i} missing`);
      ordered.push(part);
    }
    return new File(ordered, "download", { type: "application/octet-stream" });
  }

  async close(): Promise<void> {}

  async discard(): Promise<void> {
    this.parts = new Map();
  }
}

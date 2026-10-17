import type { ChunkSink } from "./sink";

interface WritableFileStream {
  write(params: { type: "write"; position: number; data: BufferSource }): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface WritableFileHandle {
  createWritable(options?: { keepExistingData?: boolean }): Promise<WritableFileStream>;
}

export interface DirectoryHandleLike {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<unknown>;
  removeEntry(name: string): Promise<void>;
}

type DirectoryPicker = (options?: { mode?: "readwrite"; id?: string }) => Promise<DirectoryHandleLike>;

/** Chromium desktop: lets the user pick a folder, then writes files straight into it. */
export function canSaveDirectlyToDisk(): boolean {
  return typeof window !== "undefined" && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

/** Must be called from a user gesture (e.g. the Accept click). */
export async function pickDirectory(): Promise<DirectoryHandleLike | null> {
  const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  if (!picker) return null;
  try {
    return await picker({ mode: "readwrite", id: "droply-downloads" });
  } catch {
    return null; // The user cancelled.
  }
}

/** Writes each chunk at its offset directly into a file the user chose. No double disk usage. */
export class FsAccessSink implements ChunkSink {
  readonly kind = "fs-access" as const;
  private writable: Promise<WritableFileStream> | null = null;

  constructor(
    private readonly directory: DirectoryHandleLike,
    readonly fileName: string,
  ) {}

  private stream(): Promise<WritableFileStream> {
    this.writable ??= (async () => {
      const handle = (await this.directory.getFileHandle(this.fileName, { create: true })) as WritableFileHandle;
      return handle.createWritable({ keepExistingData: true });
    })();
    return this.writable;
  }

  async write(_index: number, offset: number, data: Uint8Array): Promise<void> {
    const stream = await this.stream();
    await stream.write({ type: "write", position: offset, data: data as Uint8Array<ArrayBuffer> });
  }

  async finalize(): Promise<null> {
    // Closing commits the file under its final name.
    const stream = await this.stream();
    this.writable = null;
    await stream.close();
    return null;
  }

  async close(): Promise<void> {
    // Keep the stream open while paused: closing would commit a partial file.
  }

  async discard(): Promise<void> {
    if (this.writable) {
      const stream = await this.writable;
      this.writable = null;
      await stream.abort().catch(() => undefined);
    }
    await this.directory.removeEntry(this.fileName).catch(() => undefined);
  }
}

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
  getDirectoryHandle?(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
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

/**
 * Writes each chunk at its offset directly into a file the user chose. No double disk usage.
 * `folderPath` (already sanitized) recreates a sent folder's structure inside that folder.
 */
/** Names being written right now, per folder: two files with one name don't pick the same. */
const reserved = new WeakMap<DirectoryHandleLike, Set<string>>();

async function exists(dir: DirectoryHandleLike, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/** `name`, or "name (1).ext", "name (2).ext"… : never overwrites a file already in the folder. */
async function freeName(dir: DirectoryHandleLike, name: string): Promise<string> {
  const taken = reserved.get(dir) ?? new Set<string>();
  reserved.set(dir, taken);
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 0; ; i += 1) {
    const candidate = i === 0 ? name : `${base} (${i})${ext}`;
    if (taken.has(candidate)) continue;
    taken.add(candidate);
    if (!(await exists(dir, candidate))) return candidate;
  }
}

export class FsAccessSink implements ChunkSink {
  readonly kind = "fs-access" as const;
  private writable: Promise<WritableFileStream> | null = null;
  private target: Promise<DirectoryHandleLike> | null = null;
  /** The name actually used in the folder (fileName, or a free variant of it). */
  private finalName: Promise<string> | null = null;

  constructor(
    private readonly directory: DirectoryHandleLike,
    readonly fileName: string,
    private readonly folderPath: string | null = null,
  ) {}

  private folder(): Promise<DirectoryHandleLike> {
    this.target ??= (async () => {
      let dir = this.directory;
      for (const segment of this.folderPath?.split("/") ?? []) {
        if (!dir.getDirectoryHandle) break;
        dir = await dir.getDirectoryHandle(segment, { create: true });
      }
      return dir;
    })();
    return this.target;
  }

  private stream(): Promise<WritableFileStream> {
    this.writable ??= (async () => {
      const dir = await this.folder();
      this.finalName ??= freeName(dir, this.fileName);
      const handle = (await dir.getFileHandle(await this.finalName, { create: true })) as WritableFileHandle;
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
    if (!this.finalName) return; // nothing was written
    const dir = await this.folder().catch(() => this.directory);
    const name = await this.finalName;
    await dir.removeEntry(name).catch(() => undefined);
    reserved.get(dir)?.delete(name);
  }
}

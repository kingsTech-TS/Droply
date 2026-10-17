// Dedicated worker that writes received chunks into the Origin Private File System with
// synchronous access handles (fast random-access writes; only available in workers).

import { OPFS_DIR } from "./storage-constants";

interface SyncAccessHandle {
  write(buffer: ArrayBufferView, options?: { at?: number }): number;
  truncate(size: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
}

interface SyncFileHandle {
  createSyncAccessHandle(): Promise<SyncAccessHandle>;
}

export type WorkerRequest =
  | { id: number; op: "probe" }
  | { id: number; op: "open"; name: string; size: number }
  | { id: number; op: "write"; name: string; offset: number; data: ArrayBuffer }
  | { id: number; op: "close"; name: string }
  | { id: number; op: "delete"; name: string };

export type WorkerResponse = { id: number; ok: true } | { id: number; ok: false; error: string };


interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}

const scope = self as unknown as WorkerScope;
const handles = new Map<string, SyncAccessHandle>();

async function directory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

async function open(name: string, size: number): Promise<SyncAccessHandle> {
  const existing = handles.get(name);
  if (existing) return existing;
  const dir = await directory();
  const file = (await dir.getFileHandle(name, { create: true })) as unknown as SyncFileHandle;
  const handle = await file.createSyncAccessHandle();
  // Reserve the final size up front so the quota check fails early, not at 90%.
  if (handle.getSize() !== size) handle.truncate(size);
  handles.set(name, handle);
  return handle;
}

async function handle(request: WorkerRequest): Promise<void> {
  switch (request.op) {
    case "probe": {
      const dir = await directory();
      const file = (await dir.getFileHandle(".probe", { create: true })) as unknown as SyncFileHandle;
      if (typeof file.createSyncAccessHandle !== "function") throw new Error("no sync access handles");
      const h = await file.createSyncAccessHandle();
      h.close();
      await dir.removeEntry(".probe");
      return;
    }
    case "open":
      await open(request.name, request.size);
      return;
    case "write": {
      const h = handles.get(request.name);
      if (!h) throw new Error("file not open");
      const view = new Uint8Array(request.data);
      let written = 0;
      while (written < view.byteLength) {
        written += h.write(view.subarray(written), { at: request.offset + written });
      }
      return;
    }
    case "close": {
      const h = handles.get(request.name);
      if (h) {
        h.flush();
        h.close();
        handles.delete(request.name);
      }
      return;
    }
    case "delete": {
      const h = handles.get(request.name);
      if (h) {
        h.close();
        handles.delete(request.name);
      }
      const dir = await directory();
      await dir.removeEntry(request.name).catch(() => undefined);
      return;
    }
  }
}

// Requests are processed strictly one at a time, in order.
let queue: Promise<void> = Promise.resolve();

scope.onmessage = (event) => {
  const request = event.data;
  queue = queue.then(async () => {
    try {
      await handle(request);
      scope.postMessage({ id: request.id, ok: true });
    } catch (error) {
      scope.postMessage({ id: request.id, ok: false, error: String(error) });
    }
  });
};

import { logger } from "@/lib/utils/logger";
import type { WorkerRequest, WorkerResponse } from "../storage.worker";
import type { ChunkSink } from "./sink";

import { OPFS_DIR } from "../storage-constants";

type Pending = { resolve: () => void; reject: (error: Error) => void };

/** One shared storage worker per page. */
class StorageWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  private ensure(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("../storage.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        const entry = this.pending.get(response.id);
        if (!entry) return;
        this.pending.delete(response.id);
        if (response.ok) entry.resolve();
        else entry.reject(new Error(response.error));
      };
      this.worker.onerror = (event) => {
        logger.warn("opfs", "storage worker error", event.message);
        for (const entry of this.pending.values()) entry.reject(new Error("storage worker failed"));
        this.pending.clear();
      };
    }
    return this.worker;
  }

  call(request: DistributiveOmit<WorkerRequest, "id">, transfer: Transferable[] = []): Promise<void> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ensure().postMessage({ ...request, id } as WorkerRequest, transfer);
    });
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

let client: StorageWorkerClient | null = null;
let supported: Promise<boolean> | null = null;

function workerClient(): StorageWorkerClient {
  client ??= new StorageWorkerClient();
  return client;
}

/**
 * Preferred tier: chunks are written at their offsets into one OPFS file by a worker. The
 * finished File is disk-backed, so saving it never loads it into memory.
 */
export class OpfsSink implements ChunkSink {
  readonly kind = "opfs" as const;
  private opened: Promise<void> | null = null;

  constructor(
    private readonly transferId: string,
    private readonly size: number,
  ) {}

  static isAvailable(): Promise<boolean> {
    supported ??= (async () => {
      if (typeof Worker === "undefined" || typeof navigator === "undefined") return false;
      if (typeof navigator.storage?.getDirectory !== "function") return false;
      try {
        await workerClient().call({ op: "probe" });
        return true;
      } catch (error) {
        logger.debug("opfs", "OPFS sync access unavailable", String(error));
        return false;
      }
    })();
    return supported;
  }

  private get name(): string {
    return `${this.transferId}.part`;
  }

  private open(): Promise<void> {
    this.opened ??= workerClient().call({ op: "open", name: this.name, size: this.size });
    return this.opened;
  }

  async write(_index: number, offset: number, data: Uint8Array): Promise<void> {
    await this.open();
    // Transfer the buffer to the worker without copying when `data` spans all of it.
    const whole = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;
    const buffer = (whole ? data.buffer : data.slice().buffer) as ArrayBuffer;
    await workerClient().call({ op: "write", name: this.name, offset, data: buffer }, [buffer]);
  }

  async finalize(): Promise<File> {
    await this.close();
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    const handle = await dir.getFileHandle(this.name);
    return handle.getFile();
  }

  async close(): Promise<void> {
    if (!this.opened) return;
    this.opened = null;
    await workerClient().call({ op: "close", name: this.name });
  }

  async discard(): Promise<void> {
    this.opened = null;
    await workerClient().call({ op: "delete", name: this.name });
  }
}

/** Deletes OPFS leftovers whose transfer is no longer tracked. */
export async function cleanOrphanedOpfsFiles(keepTransferIds: ReadonlySet<string>): Promise<void> {
  if (typeof navigator === "undefined" || typeof navigator.storage?.getDirectory !== "function") return;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    const names: string[] = [];
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
    for (const name of names) {
      const id = name.replace(/\.part$/, "");
      if (!keepTransferIds.has(id)) await dir.removeEntry(name).catch(() => undefined);
    }
  } catch (error) {
    logger.debug("opfs", "cleanup skipped", String(error));
  }
}

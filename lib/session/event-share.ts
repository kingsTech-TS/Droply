// Event rooms: the host shares files into the room's catalog (metadata on the server), and
// each guest picks what to download. A guest asks the host's device for a file over the
// peer-to-peer channel; the host's device sends it as a normal transfer tagged with the
// guest's request id, which the guest accepts without asking. Previews come the same way:
// small JPEGs the host's device makes on demand.
import { addToCatalog, removeFromCatalog } from "@/lib/api/rooms";
import { userMessage } from "@/lib/api/errors";
import { scaledImage } from "@/lib/media/thumbnail";
import { videoFrame } from "@/lib/media/video-frame";
import { Store } from "@/lib/utils/emitter";
import { fileKind } from "@/lib/utils/file-kind";
import { randomId } from "@/lib/utils/id";
import { logger } from "@/lib/utils/logger";
import type { PeerMessenger } from "@/lib/webrtc/messaging";
import { MAX_THUMB_DATA, MAX_THUMB_REQUEST, type AppMessage } from "@/lib/webrtc/protocol";
import type { Notice, TransferManager } from "@/lib/webrtc/transfer-manager";
import type { CatalogItem, CatalogItemIn } from "@/types/room";

const ADD_BATCH = 100;
const THUMB_SIZES: readonly [number, number][] = [
  [320, 0.7],
  [200, 0.6],
];

/** A guest's request for one shared file. */
export interface EventRequest {
  requestId: string;
  at: number;
  /** The host said the file is gone (e.g. it reloaded the page). */
  unavailable: boolean;
}

export interface EventShareDeps {
  roomId: string;
  token: string;
  selfId: string;
  hostId: () => string | null;
  messenger: PeerMessenger;
  transfers: TransferManager;
  notify: (notice: Notice) => void;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    // A small generated preview JPEG (≤ MAX_THUMB_DATA), never the shared file itself.
    // eslint-disable-next-line no-restricted-properties
    reader.readAsDataURL(blob);
  });
}

function folderOf(file: File): string | null {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
  return relative.split("/").slice(0, -1).join("/") || null;
}

export class EventShare {
  /** What the host shares (from the server; same on every device). */
  readonly catalog = new Store<CatalogItem[]>([]);
  /** Guest: previews received from the host, by item id (data URLs). */
  readonly thumbs = new Store<Readonly<Record<string, string>>>({});
  /** Guest: files this device asked for, by item id. */
  readonly requests = new Store<Readonly<Record<string, EventRequest>>>({});
  /** Host: files shared from this device that are still here (by item id). */
  readonly local = new Store<ReadonlySet<string>>(new Set());

  // Host side.
  private readonly files = new Map<string, File>();
  private readonly thumbCache = new Map<string, Promise<string | null>>();
  private readonly handledRequests = new Set<string>();
  /** Request id → item id, for the host's download counts. */
  readonly requestItems = new Map<string, string>();
  // Guest side.
  private readonly thumbsAsked = new Set<string>();
  private readonly requestIds = new Set<string>();

  constructor(private readonly deps: EventShareDeps) {}

  get isHost(): boolean {
    return this.deps.hostId() === this.deps.selfId;
  }

  setCatalog(items: readonly CatalogItem[]): void {
    this.catalog.set([...items]);
  }

  // --- host ------------------------------------------------------------------------------

  /** Shares files with everyone in the room. Returns how many were shared. */
  async share(files: readonly File[]): Promise<number> {
    const fresh = files.filter((f) => f.size > 0);
    const items: CatalogItemIn[] = fresh.map((file) => {
      const itemId = randomId("it");
      this.files.set(itemId, file);
      return { item_id: itemId, name: file.name || "file", size: file.size, mime_type: file.type || "application/octet-stream", folder: folderOf(file) };
    });
    this.publishLocal();
    let shared = 0;
    try {
      for (let i = 0; i < items.length; i += ADD_BATCH) {
        const view = await addToCatalog(this.deps.roomId, items.slice(i, i + ADD_BATCH), this.deps.token);
        this.setCatalog(view.items);
        shared += Math.min(ADD_BATCH, items.length - i);
      }
    } catch (error) {
      for (const item of items.slice(shared)) this.files.delete(item.item_id);
      this.publishLocal();
      this.deps.notify({ kind: "error", message: userMessage(error) });
    }
    return shared;
  }

  /** Stops sharing a file (guests already downloading it still finish). */
  async unshare(itemId: string): Promise<void> {
    const view = await removeFromCatalog(this.deps.roomId, itemId, this.deps.token);
    this.files.delete(itemId);
    this.thumbCache.delete(itemId);
    this.publishLocal();
    this.setCatalog(view.items);
  }

  /** The shared File on this device, for the host's own previews. */
  fileFor(itemId: string): File | null {
    return this.files.get(itemId) ?? null;
  }

  private publishLocal(): void {
    this.local.set(new Set(this.files.keys()));
  }

  private async thumbnail(itemId: string): Promise<string | null> {
    const cached = this.thumbCache.get(itemId);
    if (cached) return cached;
    const file = this.files.get(itemId);
    if (!file) return null;
    const kind = fileKind(file.name, file.type);
    if (kind !== "image" && kind !== "video") return null;
    const made = (async () => {
      for (const [size, quality] of THUMB_SIZES) {
        const blob = kind === "image" ? await scaledImage(file, size, quality) : await videoFrame(file, size, quality);
        if (!blob) return null;
        const data = await blobToDataUrl(blob);
        if (data.length <= MAX_THUMB_DATA) return data;
      }
      return null;
    })().catch(() => null);
    this.thumbCache.set(itemId, made);
    return made;
  }

  // --- guest ------------------------------------------------------------------------------

  /** Asks the host's device for these files. Returns how many requests went out. */
  async download(itemIds: readonly string[]): Promise<number> {
    const host = this.deps.hostId();
    if (!host || this.isHost) return 0;
    const pending = itemIds.map((itemId) => ({ itemId, requestId: randomId("ev") }));
    for (const { requestId } of pending) this.requestIds.add(requestId);
    this.requests.update((all) => {
      const next = { ...all };
      for (const { itemId, requestId } of pending) next[itemId] = { requestId, at: Date.now(), unavailable: false };
      return next;
    });
    // All at once: they share one connection to the host, opened by the first.
    const results = await Promise.all(
      pending.map(({ itemId, requestId }) => this.deps.messenger.send(host, { kind: "event_get", itemId, requestId })),
    );
    const failed = pending.filter((_, i) => !results[i]);
    if (failed.length > 0) {
      for (const { requestId } of failed) this.requestIds.delete(requestId);
      this.requests.update((all) => {
        const next = { ...all };
        for (const { itemId, requestId } of failed) if (next[itemId]?.requestId === requestId) delete next[itemId];
        return next;
      });
    }
    const sent = pending.length - failed.length;
    if (sent < itemIds.length) {
      this.deps.notify({ kind: "warning", message: "Couldn't reach the host. Try again in a moment." });
    }
    return sent;
  }

  /** Asks the host for previews of these items (each one once). */
  requestThumbs(itemIds: readonly string[]): void {
    const host = this.deps.hostId();
    if (!host || this.isHost) return;
    const wanted = itemIds.filter((id) => !this.thumbsAsked.has(id));
    if (wanted.length === 0) return;
    for (const id of wanted) this.thumbsAsked.add(id);
    for (let i = 0; i < wanted.length; i += MAX_THUMB_REQUEST) {
      const batch = wanted.slice(i, i + MAX_THUMB_REQUEST);
      void this.deps.messenger.send(host, { kind: "event_thumbs", itemIds: batch }).then((ok) => {
        // Not reachable now: allow asking again later.
        if (!ok) for (const id of batch) this.thumbsAsked.delete(id);
      });
    }
  }

  /** For the transfer manager: accept the host's transfers this device asked for. */
  isRequested(senderId: string, batchId: string): boolean {
    return senderId === this.deps.hostId() && this.requestIds.has(batchId);
  }

  // --- messages -----------------------------------------------------------------------------

  /** Handles event messages; returns false for anything else. */
  handle(peerId: string, message: AppMessage): boolean {
    switch (message.kind) {
      case "event_get":
        if (this.isHost) void this.serve(peerId, message.itemId, message.requestId);
        return true;
      case "event_thumbs":
        if (this.isHost) void this.sendThumbs(peerId, message.itemIds);
        return true;
      case "event_thumb":
        if (peerId === this.deps.hostId()) this.thumbs.update((all) => ({ ...all, [message.itemId]: message.data }));
        return true;
      case "event_unavailable":
        if (peerId === this.deps.hostId()) {
          this.requests.update((all) => {
            const request = all[message.itemId];
            return request ? { ...all, [message.itemId]: { ...request, unavailable: true } } : all;
          });
        }
        return true;
      default:
        return false;
    }
  }

  private async serve(peerId: string, itemId: string, requestId: string): Promise<void> {
    const key = `${peerId}:${requestId}`;
    if (this.handledRequests.has(key)) return;
    this.handledRequests.add(key);
    const file = this.files.get(itemId);
    const shared = this.catalog.getSnapshot().some((item) => item.item_id === itemId);
    if (!file || !shared) {
      await this.deps.messenger.send(peerId, { kind: "event_unavailable", itemId });
      return;
    }
    this.requestItems.set(requestId, itemId);
    this.deps.transfers.send([file], [peerId], { batchId: requestId });
  }

  private async sendThumbs(peerId: string, itemIds: readonly string[]): Promise<void> {
    for (const itemId of itemIds) {
      try {
        const data = await this.thumbnail(itemId);
        if (data) await this.deps.messenger.send(peerId, { kind: "event_thumb", itemId, data });
      } catch (error) {
        logger.debug("event", "preview failed", String(error));
      }
    }
  }
}

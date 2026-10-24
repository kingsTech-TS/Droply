// Received files save themselves into a "Droply" folder. Chromium on computers (Chrome, Edge,
// Opera, Brave) lets a site write to a folder the user picked once: we keep that folder's
// handle in IndexedDB, create "Droply" inside it, and stream every accepted file straight into
// it (no Save step). The browser may ask to confirm access again on a later visit; that needs a
// click (the Accept button, or the banner in the room).
//
// Other browsers (Firefox, Safari, every phone browser) can't write to folders: finished files
// download automatically to the browser's Downloads folder instead (see `autoDownload`).
import { Store } from "@/lib/utils/emitter";
import { logger } from "@/lib/utils/logger";
import { sanitizeFileName } from "@/lib/utils/sanitize-filename";
import { openDb, requestToPromise, STORE_SETTINGS, transactionDone } from "./indexed-db";
import type { DirectoryHandleLike } from "./sinks/fs-access-sink";

export const DROPLY_FOLDER_NAME = "Droply";
const HANDLE_KEY = "save-folder";

/** unsupported: this browser can't write to folders. unset: no folder chosen yet. */
export type DroplyFolderStatus = "unsupported" | "unset" | "needs-permission" | "ready";

interface PermissionHandle extends DirectoryHandleLike {
  name: string;
  queryPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike & PermissionHandle>;
}

type DirectoryPicker = (options?: { id?: string; mode?: "readwrite"; startIn?: string }) => Promise<PermissionHandle>;

export const droplyFolder = new Store<{ status: DroplyFolderStatus; label: string | null }>({ status: "unset", label: null });

export function canUseDroplyFolder(): boolean {
  return typeof window !== "undefined" && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

async function loadParent(): Promise<PermissionHandle | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_SETTINGS, "readonly");
    const handle = (await requestToPromise(tx.objectStore(STORE_SETTINGS).get(HANDLE_KEY))) as PermissionHandle | undefined;
    return handle ?? null;
  } catch {
    return null;
  }
}

async function storeParent(handle: PermissionHandle): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction(STORE_SETTINGS, "readwrite");
  tx.objectStore(STORE_SETTINGS).put(handle, HANDLE_KEY);
  await transactionDone(tx);
}

/** The picked folder itself if the user picked a "Droply" folder, else "Droply" inside it. */
async function droplyIn(parent: PermissionHandle): Promise<DirectoryHandleLike> {
  if (parent.name === DROPLY_FOLDER_NAME) return parent;
  return parent.getDirectoryHandle(DROPLY_FOLDER_NAME, { create: true });
}

function labelFor(parent: PermissionHandle): string {
  return parent.name === DROPLY_FOLDER_NAME ? DROPLY_FOLDER_NAME : `${parent.name}/${DROPLY_FOLDER_NAME}`;
}

async function hasPermission(handle: PermissionHandle, ask: boolean): Promise<boolean> {
  const options = { mode: "readwrite" as const };
  const state = (await handle.queryPermission?.(options)) ?? "granted";
  if (state === "granted") return true;
  if (!ask || !handle.requestPermission) return false;
  return (await handle.requestPermission(options)) === "granted";
}

/** Re-reads the remembered folder and whether the browser still allows writing to it. */
export async function refreshDroplyFolder(): Promise<DroplyFolderStatus> {
  if (!canUseDroplyFolder()) {
    droplyFolder.set({ status: "unsupported", label: null });
    return "unsupported";
  }
  const parent = await loadParent();
  if (!parent) {
    droplyFolder.set({ status: "unset", label: null });
    return "unset";
  }
  const status: DroplyFolderStatus = (await hasPermission(parent, false).catch(() => false)) ? "ready" : "needs-permission";
  droplyFolder.set({ status, label: labelFor(parent) });
  return status;
}

/**
 * The Droply folder to save into, or null. `ask` may show the browser's permission prompt,
 * so it must come from a click (e.g. Accept).
 */
export async function getDroplyFolder({ ask = false }: { ask?: boolean } = {}): Promise<DirectoryHandleLike | null> {
  if (!canUseDroplyFolder()) return null;
  const parent = await loadParent();
  if (!parent) return null;
  try {
    if (!(await hasPermission(parent, ask))) {
      droplyFolder.set({ status: "needs-permission", label: labelFor(parent) });
      return null;
    }
    const folder = await droplyIn(parent);
    droplyFolder.set({ status: "ready", label: labelFor(parent) });
    return folder;
  } catch (error) {
    // Deleted or moved: forget it and fall back to downloads.
    logger.warn("save", "Droply folder unavailable", String(error));
    droplyFolder.set({ status: "unset", label: null });
    return null;
  }
}

/** Lets the user pick where the Droply folder goes (opens at Downloads). From a click only. */
export async function chooseDroplyFolder(): Promise<DirectoryHandleLike | null> {
  const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  if (!picker) return null;
  let parent: PermissionHandle;
  try {
    parent = await picker({ id: "droply-save", mode: "readwrite", startIn: "downloads" });
  } catch {
    return null; // cancelled
  }
  await storeParent(parent).catch((error: unknown) => logger.warn("save", "couldn't remember the folder", String(error)));
  const folder = await droplyIn(parent);
  droplyFolder.set({ status: "ready", label: labelFor(parent) });
  return folder;
}

/**
 * Browsers without folder access: starts a normal download (to Downloads). Works without a
 * click in most browsers; iPhone Safari still asks per file.
 */
export function autoDownload(file: Blob, rawName: string): void {
  const blob = file.type === "application/octet-stream" ? file : file.slice(0, file.size, "application/octet-stream");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeFileName(rawName);
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

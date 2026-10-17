// How much memory Droply may use on this device. Phones close (and reload) a tab that uses
// too much, which looks like a disconnect in the middle of sending. On "constrained" and
// "low" devices, transfers use smaller buffers and previews are small and few.

export type MemoryClass = "low" | "constrained" | "normal";

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i;

export function memoryClassFrom(deviceMemoryGb: number | undefined, mobile: boolean): MemoryClass {
  // navigator.deviceMemory (Chromium) reports 0.25–8 GB, rounded down.
  if (deviceMemoryGb !== undefined && deviceMemoryGb <= 2) return "low";
  if (mobile || (deviceMemoryGb !== undefined && deviceMemoryGb <= 4)) return "constrained";
  return "normal";
}

let cached: MemoryClass | null = null;

export function memoryClass(): MemoryClass {
  if (cached) return cached;
  if (typeof navigator === "undefined") return "normal";
  const gb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  // iPadOS reports a Mac user agent; touch support gives it away.
  const mobile = MOBILE_UA.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  cached = memoryClassFrom(typeof gb === "number" ? gb : undefined, mobile);
  return cached;
}

const MiB = 1024 * 1024;

export interface MemoryBudget {
  /** Largest transfer chunk (the sender holds about two in memory per file). */
  maxChunkSize: number;
  /** Largest DataChannel send buffer. */
  maxHighWater: number;
  /** Files sent at the same time (all recipients). */
  maxActiveTransfers: number;
  /** Decode image previews at all, and up to how many megapixels. */
  previewMaxMegapixels: number;
  /** <video> elements as thumbnails (each holds a hardware decoder on phones). */
  videoThumbnails: boolean;
  /** Longest side when showing a received photo full screen (0 = original). */
  viewerMaxDimension: number;
}

export const MEMORY_BUDGETS: Record<MemoryClass, MemoryBudget> = {
  normal: {
    maxChunkSize: 8 * MiB,
    maxHighWater: 8 * MiB,
    maxActiveTransfers: 4,
    previewMaxMegapixels: 100,
    videoThumbnails: true,
    viewerMaxDimension: 0,
  },
  constrained: {
    maxChunkSize: 2 * MiB,
    maxHighWater: 4 * MiB,
    maxActiveTransfers: 2,
    previewMaxMegapixels: 24,
    videoThumbnails: false,
    viewerMaxDimension: 2560,
  },
  low: {
    maxChunkSize: 1 * MiB,
    maxHighWater: 2 * MiB,
    maxActiveTransfers: 1,
    previewMaxMegapixels: 0,
    videoThumbnails: false,
    viewerMaxDimension: 1600,
  },
};

export const memoryBudget = (): MemoryBudget => MEMORY_BUDGETS[memoryClass()];

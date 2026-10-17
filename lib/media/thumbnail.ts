// Small preview images. Full-size <img> elements for every photo in the transfer list made
// phones run out of memory (a 12 MP photo decodes to ~48 MB) and close the tab mid-send.
// Instead, each photo is decoded once, scaled down, and kept as a small JPEG; decoding
// happens one photo at a time, and very large photos are skipped on phones.
import { memoryBudget } from "@/lib/device/memory";
import { imageSize, type ImageSize } from "./image-size";

const cache = new WeakMap<Blob, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

/** Runs decode jobs one after another so at most one full-size bitmap exists at a time. */
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

function fit(size: ImageSize, maxDimension: number): ImageSize {
  const scale = Math.min(1, maxDimension / Math.max(size.width, size.height));
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality });
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Decodes `file` scaled to fit `maxDimension` and re-encodes it as JPEG. Returns null when
 * the browser can't, or when the photo is too big to decode safely on this device.
 */
export async function scaledImage(file: Blob, maxDimension: number, quality = 0.8): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function") return null;
  const budget = memoryBudget();
  const size = await imageSize(file);
  if (!size) return null;
  if ((size.width * size.height) / 1_000_000 > budget.previewMaxMegapixels) return null;
  const target = fit(size, maxDimension);
  return serial(async () => {
    let bitmap: ImageBitmap;
    try {
      // Asking for the target size lets the decoder scale while decoding where it can.
      bitmap = await createImageBitmap(file, { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "medium" });
    } catch {
      // Browsers without resize options (older Safari): a full decode, only where memory allows.
      if (budget.viewerMaxDimension !== 0) return null;
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        return null;
      }
    }
    try {
      const canvas: HTMLCanvasElement | OffscreenCanvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(target.width, target.height)
          : Object.assign(document.createElement("canvas"), { width: target.width, height: target.height });
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, target.width, target.height);
      return await canvasToBlob(canvas, quality);
    } finally {
      bitmap.close();
    }
  });
}

/** An object URL of a small (≈ 2× `size` px) JPEG preview, cached per file. */
export function thumbnailUrl(file: Blob, size = 96): Promise<string | null> {
  const cached = cache.get(file);
  if (cached) return cached;
  const made = scaledImage(file, size * 2, 0.7)
    .then((blob) => (blob ? URL.createObjectURL(blob) : null))
    .catch(() => null);
  cache.set(file, made);
  return made;
}

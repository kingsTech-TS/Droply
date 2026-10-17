// "Send smaller photos": resizes large JPEG/PNG/WebP photos in the browser before sending.
// GIFs (animation) and formats the browser can't decode are left untouched. The original is
// kept if compression wouldn't make it meaningfully smaller.
import { sniffMedia } from "./sniff";

const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIN_SIZE = 500_000;
const MAX_DIMENSION = 2560;
const QUALITY = 0.85;

function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressPhoto(file: File): Promise<File> {
  if (file.size < MIN_SIZE || typeof createImageBitmap !== "function") return file;
  const media = await sniffMedia(file);
  if (!media || !COMPRESSIBLE.has(media.mime)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas: HTMLCanvasElement | OffscreenCanvas =
      typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await toBlob(canvas, "image/jpeg", QUALITY);
    if (!blob || blob.size > file.size * 0.9) return file;
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

export async function compressPhotos(files: readonly File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) out.push(await compressPhoto(file));
  return out;
}

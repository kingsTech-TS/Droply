// "Send smaller photos": resizes large JPEG/PNG/WebP photos in the browser before sending.
// GIFs (animation) and formats the browser can't decode are left untouched. The original is
// kept if compression wouldn't make it meaningfully smaller.
import { sniffMedia } from "./sniff";
import { scaledImage } from "./thumbnail";

const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIN_SIZE = 500_000;
const MAX_DIMENSION = 2560;
const QUALITY = 0.85;

export async function compressPhoto(file: File): Promise<File> {
  if (file.size < MIN_SIZE || typeof createImageBitmap !== "function") return file;
  const media = await sniffMedia(file);
  if (!media || !COMPRESSIBLE.has(media.mime)) return file;
  // Decodes at the target size, one photo at a time, and skips photos too large to decode
  // safely on this device (they're sent as they are).
  const blob = await scaledImage(file, MAX_DIMENSION, QUALITY);
  if (!blob || blob.size > file.size * 0.9) return file;
  const base = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}

export async function compressPhotos(files: readonly File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) out.push(await compressPhoto(file));
  return out;
}

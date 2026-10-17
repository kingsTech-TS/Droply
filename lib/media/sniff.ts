// Decides whether a received file is safe to preview, from its first bytes (magic numbers),
// never from its name or MIME type (both come from the other device). Only raster images
// and common video containers qualify; SVG, HTML and everything else never render.

export interface MediaKind {
  kind: "image" | "video";
  mime: string;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length));

export function sniffBytes(bytes: Uint8Array): MediaKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mime: "image/png" };
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return { kind: "image", mime: "image/gif" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return { kind: "image", mime: "image/webp" };
  if (ascii(bytes, 0, 2) === "BM") return { kind: "image", mime: "image/bmp" };
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (brand === "avif" || brand === "avis") return { kind: "image", mime: "image/avif" };
    if (brand === "qt  ") return { kind: "video", mime: "video/quicktime" };
    if (/^(isom|iso[2-9]|mp4[12]|avc1|M4V |M4VH|MSNV|3gp[4-6]|dash)$/.test(brand)) return { kind: "video", mime: "video/mp4" };
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: "video", mime: "video/webm" };
  return null;
}

/** Reads only the first 16 bytes of the file. */
export async function sniffMedia(file: Blob): Promise<MediaKind | null> {
  if (file.size < 12) return null;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return sniffBytes(head);
}

/** A Blob with the sniffed MIME type, so <img>/<video> can display it. */
export function asMedia(file: Blob, media: MediaKind): Blob {
  return file.slice(0, file.size, media.mime);
}

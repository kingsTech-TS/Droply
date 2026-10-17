// SHA-256 helpers. Web Crypto cannot hash a stream, so files are verified per chunk and
// then with a root digest over the ordered list of chunk digests.

export function hasWebCrypto(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function";
}

export function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(data: BufferSource): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

/** SHA-256 over the concatenated chunk digests (hex, in chunk order). */
export async function rootDigest(chunkDigests: readonly string[]): Promise<string> {
  return sha256Hex(new TextEncoder().encode(chunkDigests.join("")));
}

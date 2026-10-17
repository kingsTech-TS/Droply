// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildZip, crc32Update } from "@/lib/storage/zip";

/** A small independent ZIP reader (central directory → local header → data). */
async function readZip(blob: Blob): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  expect(eocd).toBeGreaterThanOrEqual(0);
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(ptr, true)).toBe(0x02014b50);
    const crc = view.getUint32(ptr + 16, true);
    const size = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localName + localExtra;
    const data = bytes.subarray(start, start + size);
    expect(crc32Update(0, data)).toBe(crc);
    out.set(name, data);
    ptr += 46 + nameLen + extraLen;
  }
  return out;
}

describe("buildZip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32Update(0, new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("stores files with their folder paths and exact contents", async () => {
    const a = new Uint8Array(100_000).map((_, i) => i % 251);
    const b = new TextEncoder().encode("hello droply");
    const zip = await buildZip([
      { path: "photos/2026/a.bin", file: new Blob([a]) },
      { path: "notes ✓.txt", file: new Blob([b]) },
    ]);
    const files = await readZip(zip);
    expect([...files.keys()]).toEqual(["photos/2026/a.bin", "notes ✓.txt"]);
    expect(Array.from(files.get("photos/2026/a.bin")!)).toEqual(Array.from(a));
    expect(new TextDecoder().decode(files.get("notes ✓.txt"))).toBe("hello droply");
  });

  it("composes the archive from the original blobs (no full copy)", async () => {
    const big = new Blob([new Uint8Array(5_000_000)]);
    const zip = await buildZip([{ path: "big.bin", file: big }]);
    expect(zip.size).toBe(big.size + 30 + 7 + 46 + 7 + 22);
  });
});

// Builds a .zip of received files without loading them into memory: the archive is a Blob
// composed of small header Blobs and the original (disk-backed) file Blobs. Each file is
// read once, in chunks, to compute its CRC-32. Entries are stored (no compression: most
// large files are already compressed), with ZIP64 records when sizes or offsets need them.

export interface ZipEntry {
  /** Path inside the archive ("photos/2026/a.jpg"); already sanitized. */
  path: string;
  file: Blob;
  lastModified?: number;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32Update(crc: number, bytes: Uint8Array): number {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const READ_CHUNK = 8 * 1024 * 1024;

export async function crc32OfBlob(blob: Blob, onProgress?: (bytes: number) => void): Promise<number> {
  let crc = 0;
  for (let offset = 0; offset < blob.size; offset += READ_CHUNK) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + READ_CHUNK).arrayBuffer());
    crc = crc32Update(crc, bytes);
    onProgress?.(Math.min(blob.size, offset + READ_CHUNK));
  }
  return crc;
}

function dosDateTime(ms: number): { date: number; time: number } {
  const d = new Date(ms);
  const year = Math.max(1980, d.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  };
}

const LIMIT = 0xfffffffe;
const UTF8_FLAG = 0x0800;

class Writer {
  private readonly view: DataView;
  private offset = 0;
  readonly bytes: Uint8Array<ArrayBuffer>;
  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }
  u16(v: number): this {
    this.view.setUint16(this.offset, v, true);
    this.offset += 2;
    return this;
  }
  u32(v: number): this {
    this.view.setUint32(this.offset, v >>> 0, true);
    this.offset += 4;
    return this;
  }
  u64(v: number): this {
    this.view.setBigUint64(this.offset, BigInt(v), true);
    this.offset += 8;
    return this;
  }
  raw(b: Uint8Array): this {
    this.bytes.set(b, this.offset);
    this.offset += b.length;
    return this;
  }
}

export async function buildZip(
  entries: readonly ZipEntry[],
  onProgress?: (done: number, total: number) => void,
  /** Tests only: write ZIP64 records even for small files. */
  options: { forceZip64?: boolean } = {},
): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  const total = entries.reduce((s, e) => s + e.file.size, 0);
  let offset = 0;
  let hashed = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const size = entry.file.size;
    const crc = await crc32OfBlob(entry.file, (bytes) => onProgress?.(hashed + bytes, total));
    hashed += size;
    const { date, time } = dosDateTime(entry.lastModified ?? Date.now());
    const zip64 = options.forceZip64 === true || size > LIMIT || offset > LIMIT;

    // Local header (ZIP64 extra field carries the real sizes).
    const localExtra = zip64 ? 20 : 0;
    const local = new Writer(30 + name.length + localExtra);
    local.u32(0x04034b50).u16(zip64 ? 45 : 20).u16(UTF8_FLAG).u16(0).u16(time).u16(date).u32(crc);
    local.u32(zip64 ? 0xffffffff : size).u32(zip64 ? 0xffffffff : size).u16(name.length).u16(localExtra).raw(name);
    if (zip64) local.u16(0x0001).u16(16).u64(size).u64(size);
    parts.push(local.bytes, entry.file);

    // Central directory record.
    const centralExtra = zip64 ? 28 : 0;
    const record = new Writer(46 + name.length + centralExtra);
    record.u32(0x02014b50).u16(zip64 ? 45 : 20).u16(zip64 ? 45 : 20).u16(UTF8_FLAG).u16(0).u16(time).u16(date).u32(crc);
    record.u32(zip64 ? 0xffffffff : size).u32(zip64 ? 0xffffffff : size).u16(name.length).u16(centralExtra);
    record.u16(0).u16(0).u16(0).u32(0).u32(zip64 ? 0xffffffff : offset).raw(name);
    if (zip64) record.u16(0x0001).u16(24).u64(size).u64(size).u64(offset);
    central.push(record.bytes);

    offset += local.bytes.length + size;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const centralOffset = offset;
  parts.push(...central);

  const needs64 = options.forceZip64 === true || entries.length >= 0xffff || centralOffset > LIMIT || centralSize > LIMIT;
  if (needs64) {
    const eocd64 = new Writer(56);
    eocd64.u32(0x06064b50).u64(44).u16(45).u16(45).u32(0).u32(0);
    eocd64.u64(entries.length).u64(entries.length).u64(centralSize).u64(centralOffset);
    const locator = new Writer(20);
    locator.u32(0x07064b50).u32(0).u64(centralOffset + centralSize).u32(1);
    parts.push(eocd64.bytes, locator.bytes);
  }
  const end = new Writer(22);
  end.u32(0x06054b50).u16(0).u16(0);
  end.u16(needs64 ? 0xffff : entries.length).u16(needs64 ? 0xffff : entries.length);
  end.u32(needs64 ? 0xffffffff : centralSize).u32(needs64 ? 0xffffffff : centralOffset).u16(0);
  parts.push(end.bytes);

  return new Blob(parts, { type: "application/zip" });
}

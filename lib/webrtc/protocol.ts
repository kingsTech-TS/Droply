// Wire protocol on the per-peer DataChannel.
//
// - String messages are small JSON control messages (`Ctl`).
// - ArrayBuffer messages are binary frames: a fixed 16-byte header and a slice of one chunk.
//
// A chunk (default 4 MiB, declared to the backend) is the unit of resume, hashing and
// storage. A frame (default 64 KiB, at most the SCTP max message size) is one message.
//
// Each direction has its own slot namespace: frames always flow from the sender of that
// slot, and `role` on `file_close` says which side is closing.
import type { ChunkRange } from "@/types/transfer";

export const PROTOCOL_VERSION = 1;
export const FRAME_MAGIC = 0xd7;
export const FRAME_HEADER_BYTES = 16;
export const MAX_SLOT = 0xffff;

export interface Frame {
  slot: number;
  chunkIndex: number;
  offset: number;
  payload: Uint8Array;
}

/** Copies header + payload into one new buffer (the only copy on the send path). */
export function encodeFrame(slot: number, chunkIndex: number, offset: number, payload: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(FRAME_HEADER_BYTES + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint8(0, FRAME_MAGIC);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint16(2, slot, true);
  view.setUint32(4, chunkIndex, true);
  view.setUint32(8, offset, true);
  view.setUint32(12, payload.byteLength, true);
  new Uint8Array(buffer, FRAME_HEADER_BYTES).set(payload);
  return buffer;
}

/** Returns a view into `buffer` (no copy), or null if the header is malformed. */
export function decodeFrame(buffer: ArrayBuffer): Frame | null {
  if (buffer.byteLength < FRAME_HEADER_BYTES) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== FRAME_MAGIC || view.getUint8(1) !== PROTOCOL_VERSION) return null;
  const length = view.getUint32(12, true);
  if (length !== buffer.byteLength - FRAME_HEADER_BYTES) return null;
  return {
    slot: view.getUint16(2, true),
    chunkIndex: view.getUint32(4, true),
    offset: view.getUint32(8, true),
    payload: new Uint8Array(buffer, FRAME_HEADER_BYTES, length),
  };
}

export type CloseReason = "done" | "paused" | "cancelled" | "error";

export type Ctl =
  // Exchanged once when the channel opens.
  | { t: "hello"; v: number; maxFrame: number }
  // Sender → receiver: start (or restart) a file in this slot.
  | {
      t: "file_open";
      slot: number;
      transferId: string;
      size: number;
      chunkSize: number;
      totalChunks: number;
    }
  // Receiver → sender: ready, these chunks are already stored, and at most `window`
  // unacknowledged chunks may be in flight (receive-side memory bound).
  | { t: "file_ready"; slot: number; have: ChunkRange[]; window: number }
  // Sender → receiver: all frames of a chunk were sent; this is its digest.
  | { t: "chunk_end"; slot: number; index: number; sha256: string }
  // Receiver → sender: chunk verified and persisted (also returns one credit).
  | { t: "chunk_ack"; slot: number; index: number }
  // Receiver → sender: chunk digest did not match; send it again.
  | { t: "chunk_nack"; slot: number; index: number }
  // Sender → receiver: every chunk was acknowledged; this is the root digest.
  | { t: "file_end"; slot: number; root: string }
  // Receiver → sender: root digest check result.
  | { t: "file_done"; slot: number; ok: boolean }
  // Either side stops a slot. `role` is the role of the side that is closing.
  | { t: "file_close"; slot: number; role: "sender" | "receiver"; reason: CloseReason }
  // Sent before an intentional close so the other side does not try to recover.
  | { t: "bye" };

type Obj = Record<string, unknown>;

const isInt = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isSlot = (v: unknown): v is number => isInt(v, 0, MAX_SLOT);
const isHex64 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

function isRanges(v: unknown): v is ChunkRange[] {
  return (
    Array.isArray(v) &&
    v.length <= 100_000 &&
    v.every((r) => Array.isArray(r) && r.length === 2 && isInt(r[0]) && isInt(r[1]) && r[0] <= r[1])
  );
}

/** Parses a control message from the remote peer. Returns null for anything malformed. */
export function parseCtl(raw: string): Ctl | null {
  if (raw.length > 4 * 1024 * 1024) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const m = data as Obj;
  switch (m.t) {
    case "hello":
      return isInt(m.v) && isInt(m.maxFrame, 1) ? { t: "hello", v: m.v, maxFrame: m.maxFrame } : null;
    case "file_open":
      return isSlot(m.slot) &&
        typeof m.transferId === "string" &&
        m.transferId.length <= 70 &&
        isInt(m.size, 1) &&
        isInt(m.chunkSize, 1) &&
        isInt(m.totalChunks, 1) &&
        m.totalChunks === Math.ceil(m.size / m.chunkSize)
        ? {
            t: "file_open",
            slot: m.slot,
            transferId: m.transferId,
            size: m.size,
            chunkSize: m.chunkSize,
            totalChunks: m.totalChunks,
          }
        : null;
    case "file_ready":
      return isSlot(m.slot) && isRanges(m.have) && isInt(m.window, 1, 64)
        ? { t: "file_ready", slot: m.slot, have: m.have, window: m.window }
        : null;
    case "chunk_end":
      return isSlot(m.slot) && isInt(m.index) && isHex64(m.sha256)
        ? { t: "chunk_end", slot: m.slot, index: m.index, sha256: m.sha256 }
        : null;
    case "chunk_ack":
    case "chunk_nack":
      return isSlot(m.slot) && isInt(m.index) ? { t: m.t, slot: m.slot, index: m.index } : null;
    case "file_end":
      return isSlot(m.slot) && isHex64(m.root) ? { t: "file_end", slot: m.slot, root: m.root } : null;
    case "file_done":
      return isSlot(m.slot) && typeof m.ok === "boolean" ? { t: "file_done", slot: m.slot, ok: m.ok } : null;
    case "file_close":
      return isSlot(m.slot) &&
        (m.role === "sender" || m.role === "receiver") &&
        (m.reason === "done" || m.reason === "paused" || m.reason === "cancelled" || m.reason === "error")
        ? { t: "file_close", slot: m.slot, role: m.role, reason: m.reason }
        : null;
    case "bye":
      return { t: "bye" };
    default:
      return null;
  }
}

export function chunkLength(index: number, size: number, chunkSize: number): number {
  const start = index * chunkSize;
  return Math.max(0, Math.min(chunkSize, size - start));
}

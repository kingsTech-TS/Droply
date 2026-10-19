// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MemorySink } from "@/lib/storage/sinks/memory-sink";
import { pinFiles } from "@/lib/storage/pin-files";
import { SyntheticSource, totalChunks, type ByteSource } from "@/lib/webrtc/chunk-manager";
import { DataChannelTransport } from "@/lib/webrtc/data-channel";
import { FileReceiver } from "@/lib/webrtc/file-receiver";
import { FileSender } from "@/lib/webrtc/file-sender";
import type { Ctl } from "@/lib/webrtc/protocol";
import { createChannelPair } from "../mocks/rtc";

const KiB = 1024;

/** A source whose reads fail: the first `failures` times, or always (Infinity). */
class FlakySource implements ByteSource {
  reads = 0;
  constructor(
    private readonly inner: ByteSource,
    private failures: number,
  ) {}
  get size() {
    return this.inner.size;
  }
  async read(start: number, end: number) {
    this.reads += 1;
    if (this.failures > 0) {
      this.failures -= 1;
      throw new DOMException("The requested file could not be read", "NotReadableError");
    }
    return this.inner.read(start, end);
  }
}

function send(source: ByteSource, readRetryDelaysMs: number[]) {
  const chunkSize = 64 * KiB;
  const total = totalChunks(source.size, chunkSize);
  const [a, b] = createChannelPair({});
  const tx = new DataChannelTransport(a, 256 * KiB);
  const rx = new DataChannelTransport(b, 256 * KiB);
  const sender = new FileSender({ transport: tx, slot: 1, transferId: "tr", source, chunkSize, totalChunks: total, frameSize: 16 * KiB, window: 4, readRetryDelaysMs });
  const receiver = new FileReceiver({
    transport: rx,
    slot: 1,
    transferId: "tr",
    size: source.size,
    chunkSize,
    totalChunks: total,
    window: 4,
    sink: new MemorySink(total),
    digests: new Map(),
    persistDigest: async () => {},
  });
  tx.events.on("ctl", (ctl: Ctl) => sender.handleCtl(ctl));
  rx.events.on("ctl", (ctl: Ctl) => (ctl.t === "file_open" ? void receiver.start() : receiver.handleCtl(ctl)));
  rx.events.on("frame", (frame) => receiver.handleFrame(frame));
  return sender.run();
}

describe("sender reading the file", () => {
  it("rides out a brief read failure", async () => {
    const source = new FlakySource(new SyntheticSource(300 * KiB), 2);
    expect(await send(source, [5, 5, 5])).toEqual({ kind: "done" });
  });

  it("reports a file that stays unreadable as a read error", async () => {
    const source = new FlakySource(new SyntheticSource(32 * KiB), Infinity); // one chunk
    expect(await send(source, [5, 5])).toEqual({ kind: "failed", reason: "read_error" });
    expect(source.reads).toBe(3); // the first try and two retries
  });
});

describe("pinFiles", () => {
  const limits = { perFile: 100, total: 150 };

  it("copies small picked files into memory, keeping name, type and date", async () => {
    const file = new File(["hello"], "IMG_1.jpg", { type: "image/jpeg", lastModified: 42 });
    const [copy] = await pinFiles([file], limits);
    expect(copy).not.toBe(file);
    expect(copy).toMatchObject({ name: "IMG_1.jpg", type: "image/jpeg", lastModified: 42, size: 5 });
    expect(await copy!.text()).toBe("hello");
    // Already copied: not copied again when it is sent.
    expect((await pinFiles([copy!], limits))[0]).toBe(copy);
  });

  it("leaves large files, files over the total budget, and unreadable files as they are", async () => {
    const big = new File(["x".repeat(101)], "video.mp4");
    const a = new File(["a".repeat(100)], "a.jpg");
    const b = new File(["b".repeat(100)], "b.jpg"); // would exceed the 150-byte total
    const broken = new File(["c"], "c.jpg");
    Object.defineProperty(broken, "arrayBuffer", { value: () => Promise.reject(new DOMException("gone", "NotReadableError")) });
    const out = await pinFiles([big, a, b, broken], limits);
    expect(out[0]).toBe(big);
    expect(out[1]).not.toBe(a);
    expect(out[2]).toBe(b);
    expect(out[3]).toBe(broken);
  });
});

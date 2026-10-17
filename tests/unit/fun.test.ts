import { beforeEach, describe, expect, it } from "vitest";
import { funDeviceName, splitAvatar } from "@/lib/fun/names";
import { addToHistory, badges, clearHistory, history, records, stats, type HistoryEntry } from "@/lib/history/history";
import { sniffBytes } from "@/lib/media/sniff";
import { generateKey, isValidKey } from "@/lib/pairing/pairing";
import { sanitizeFolderPath } from "@/lib/utils/sanitize-filename";
import { Emitter } from "@/lib/utils/emitter";
import type { DataChannelTransport } from "@/lib/webrtc/data-channel";
import { PeerMessenger, type MessengerPeers } from "@/lib/webrtc/messaging";
import { SpeedMeter } from "@/lib/webrtc/progress";
import { MAX_CHAT_MESSAGE, parseCtl, type Ctl } from "@/lib/webrtc/protocol";
import { fingerprintsOf, securityCode } from "@/lib/webrtc/security-code";
import { sumHistories } from "@/lib/webrtc/transfer-view";

const app = (m: unknown) => parseCtl(JSON.stringify({ t: "app", m }));

describe("app messages", () => {
  it("accepts valid text, chat, reactions and pairing", () => {
    expect(app({ kind: "text", id: "t1", text: "hello" })).toEqual({ t: "app", m: { kind: "text", id: "t1", text: "hello" } });
    expect(app({ kind: "chat", id: "c1", text: "hi" })?.t).toBe("app");
    expect(app({ kind: "reaction", transferId: "tr_1", emoji: "🔥" })?.t).toBe("app");
    expect(app({ kind: "pair_request", key: "a".repeat(43), name: "Laptop" })?.t).toBe("app");
    expect(app({ kind: "pair_decline" })?.t).toBe("app");
  });

  it("rejects malformed or oversized messages", () => {
    expect(app({ kind: "text", id: "t1", text: "" })).toBeNull();
    expect(app({ kind: "chat", id: "c1", text: "x".repeat(MAX_CHAT_MESSAGE + 1) })).toBeNull();
    expect(app({ kind: "chat", id: "bad id!", text: "hi" })).toBeNull();
    expect(app({ kind: "reaction", transferId: "tr_1", emoji: "💩" })).toBeNull();
    expect(app({ kind: "pair_request", key: "short", name: "Laptop" })).toBeNull();
    expect(app({ kind: "unknown" })).toBeNull();
    expect(app(null)).toBeNull();
  });

  it("parses the optional folder path and test flag on file_open", () => {
    const base = { t: "file_open", slot: 1, transferId: "tr_1", size: 10, chunkSize: 4, totalChunks: 3 };
    expect(parseCtl(JSON.stringify({ ...base, path: "a/b", test: true }))).toMatchObject({ path: "a/b", test: true });
    expect(parseCtl(JSON.stringify({ ...base, path: 5 }))).toBeNull();
    expect(parseCtl(JSON.stringify({ ...base, test: "yes" }))).toBeNull();
  });
});

describe("sanitizeFolderPath", () => {
  it("keeps safe segments and drops traversal", () => {
    expect(sanitizeFolderPath("Holiday/2026")).toBe("Holiday/2026");
    expect(sanitizeFolderPath("../../etc")).toBe("etc");
    expect(sanitizeFolderPath("a\\..\\b/./c")).toBe("a/b/c");
    expect(sanitizeFolderPath("/")).toBeNull();
    expect(sanitizeFolderPath(null)).toBeNull();
  });
});

describe("security code", () => {
  const sdp = (fp: string) => `v=0\r\na=fingerprint:sha-256 ${fp}\r\n`;
  const A = "AA:BB:CC";
  const B = "11:22:33";

  it("extracts fingerprints", () => {
    expect(fingerprintsOf(sdp(A))).toEqual(["sha-256 aa:bb:cc"]);
  });

  it("is the same on both sides and changes if a certificate is swapped", async () => {
    const mine = await securityCode(sdp(A), sdp(B));
    const theirs = await securityCode(sdp(B), sdp(A));
    expect(mine).not.toBeNull();
    expect(mine).toBe(theirs);
    expect(mine!.split(" ")).toHaveLength(4);
    expect(await securityCode(sdp(A), sdp("99:88:77"))).not.toBe(mine);
    expect(await securityCode("v=0", sdp(B))).toBeNull();
  });
});

describe("sniffBytes", () => {
  const bytes = (...parts: Array<number[] | string>) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

  it("recognises raster images and videos by magic bytes", () => {
    expect(sniffBytes(bytes([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(sniffBytes(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe("image/png");
    expect(sniffBytes(bytes("GIF89a"))).toMatchObject({ kind: "image" });
    expect(sniffBytes(bytes("RIFF", [0, 0, 0, 0], "WEBP"))?.mime).toBe("image/webp");
    expect(sniffBytes(bytes([0, 0, 0, 0x18], "ftypisom"))?.mime).toBe("video/mp4");
    expect(sniffBytes(bytes([0, 0, 0, 0x18], "ftypqt  "))?.mime).toBe("video/quicktime");
    expect(sniffBytes(bytes([0x1a, 0x45, 0xdf, 0xa3]))?.kind).toBe("video");
  });

  it("never treats SVG, HTML or unknown data as media", () => {
    expect(sniffBytes(bytes("<svg xmlns="))).toBeNull();
    expect(sniffBytes(bytes("<!doctype html>"))).toBeNull();
    expect(sniffBytes(bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });
});

describe("fun names", () => {
  it("generates an emoji name that splits back into avatar and label", () => {
    const name = funDeviceName(() => 0);
    expect(name).toBe("🦦 Sneaky Otter");
    expect(splitAvatar(name)).toEqual({ avatar: "🦦", label: "Sneaky Otter" });
    expect(splitAvatar("🐿️ Swift Squirrel").avatar).toBe("🐿️");
    expect(splitAvatar("Work laptop")).toEqual({ avatar: null, label: "Work laptop" });
    expect(funDeviceName(() => 0.9999)).toMatch(/^\S+ \w+ \w+$/);
  });
});

describe("pairing keys", () => {
  it("are 256-bit base64url and validated", () => {
    const key = generateKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isValidKey(key)).toBe(true);
    expect(isValidKey("short")).toBe(false);
    expect(isValidKey(`${key}/..`)).toBe(false);
    expect(generateKey()).not.toBe(key);
  });
});

describe("history, records, badges and stats", () => {
  beforeEach(() => clearHistory());

  const entry = (over: Partial<Omit<HistoryEntry, "id" | "kind"> & { mimeType: string }> = {}) => ({
    at: new Date(2026, 9, 3, 21).getTime(),
    direction: "outgoing" as const,
    fileName: "clip.mp4",
    fileSize: 50_000_000,
    mimeType: "video/mp4",
    peerName: "Phone",
    averageSpeed: 20_000_000,
    peakSpeed: 30_000_000,
    seconds: 2.5,
    roomSize: 2,
    ...over,
  });

  it("sets records quietly the first time and reports beating them", () => {
    expect(addToHistory(entry())).toEqual({ newAverageRecord: false, newPeakRecord: false });
    expect(records.get().bestPeak).toBe(30_000_000);
    expect(addToHistory(entry({ peakSpeed: 40_000_000 }))).toEqual({ newAverageRecord: false, newPeakRecord: true });
    // Small files never count as speed records.
    expect(addToHistory(entry({ fileSize: 1000, peakSpeed: 900_000_000 })).newPeakRecord).toBe(false);
    expect(history.get()).toHaveLength(3);
    expect(history.get()[0]!.kind).toBe("video");
  });

  it("earns badges", () => {
    addToHistory(entry({ fileSize: 2_000_000_000, peakSpeed: 120_000_000, roomSize: 6 }));
    const earned = new Set(badges(history.get(), records.get()).filter((b) => b.earned).map((b) => b.id));
    expect(earned).toEqual(new Set(["first-drop", "gigabyte-club", "speed-demon", "party-room"]));
  });

  it("computes stats for a period", () => {
    addToHistory(entry());
    addToHistory(entry({ direction: "incoming", fileName: "a.jpg", mimeType: "image/jpeg", peerName: "Tablet", fileSize: 1000 }));
    addToHistory(entry({ at: new Date(2025, 0, 1).getTime(), peerName: "Old" }));
    const s = stats(history.get(), new Date(2026, 9, 1).getTime());
    expect(s).toMatchObject({ files: 2, bytes: 50_001_000, sentBytes: 50_000_000, receivedBytes: 1000, devices: 2, busiestHour: 21 });
    expect(stats(history.get()).files).toBe(3);
  });
});

describe("speed history", () => {
  it("samples once per second and only counts peaks over a full window", () => {
    let t = 0;
    const meter = new SpeedMeter(() => t);
    meter.setActive(true);
    for (let i = 0; i <= 40; i += 1) {
      t = i * 250;
      meter.update(i * 250_000); // 1 MB/s
    }
    expect(meter.history.length).toBeGreaterThanOrEqual(9);
    expect(meter.history.length).toBeLessThanOrEqual(11);
    expect(meter.peak).toBeCloseTo(1_000_000, -3);
    expect(meter.activeSeconds).toBe(10);
  });

  it("adds histories aligned at the newest sample", () => {
    expect(sumHistories([[1, 2, 3], [10]])).toEqual([1, 2, 13]);
    expect(sumHistories([])).toEqual([]);
  });
});

describe("PeerMessenger", () => {
  function fakeTransport() {
    const events = new Emitter<{ ctl: Ctl }>();
    const sent: Ctl[] = [];
    const transport = { events, sendCtl: (m: Ctl) => (sent.push(m), true) } as unknown as DataChannelTransport;
    return { transport, events, sent };
  }

  function fakePeers() {
    const transports = new Map<string, DataChannelTransport>();
    const acquired: string[] = [];
    const released: string[] = [];
    const peers: MessengerPeers = {
      acquire: (id) => acquired.push(id),
      release: (id) => released.push(id),
      transportFor: (id) => transports.get(id) ?? null,
      events: new Emitter(),
    };
    return { peers, transports, acquired, released };
  }

  it("connects on demand, sends, releases and receives", async () => {
    const { peers, acquired, released } = fakePeers();
    const messenger = new PeerMessenger(peers);
    const t = fakeTransport();
    const received: unknown[] = [];
    messenger.events.on("message", (m) => received.push(m));

    const sending = messenger.send("dv_b", { kind: "chat", id: "c1", text: "hi" });
    peers.events.emit("transport", { peerId: "dv_b", transport: t.transport });
    expect(await sending).toBe(true);
    expect(t.sent).toEqual([{ t: "app", m: { kind: "chat", id: "c1", text: "hi" } }]);
    expect(acquired).toEqual(["dv_b"]);
    expect(released).toEqual(["dv_b"]);

    t.events.emit("ctl", { t: "app", m: { kind: "pair_decline" } });
    t.events.emit("ctl", { t: "bye" });
    expect(received).toEqual([{ peerId: "dv_b", message: { kind: "pair_decline" } }]);
    messenger.dispose();
  });

  it("resolves false when the connection fails", async () => {
    const { peers } = fakePeers();
    const messenger = new PeerMessenger(peers);
    const sending = messenger.send("dv_c", { kind: "pair_decline" });
    peers.events.emit("failed", { peerId: "dv_c" });
    expect(await sending).toBe(false);
  });
});

describe("room themes", () => {
  it("applies to the whole page and is removed for the default theme", async () => {
    const { activeRoomTheme, applyRoomTheme, THEME_STYLES } = await import("@/lib/fun/themes");
    applyRoomTheme("wedding");
    expect(document.documentElement.dataset.roomTheme).toBe("wedding");
    expect(activeRoomTheme()).toBe("wedding");
    applyRoomTheme("default");
    expect(document.documentElement.dataset.roomTheme).toBeUndefined();
    expect(activeRoomTheme()).toBeNull();
    for (const style of Object.values(THEME_STYLES)) expect(style.confetti.length).toBeGreaterThan(2);
  });
});

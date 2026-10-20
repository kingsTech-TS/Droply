import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventShare } from "@/lib/session/event-share";
import { parseServerMessage } from "@/lib/webrtc/server-messages";
import { parseCtl, type AppMessage } from "@/lib/webrtc/protocol";
import type { CatalogItem } from "@/types/room";

vi.mock("@/lib/api/rooms", () => ({
  addToCatalog: vi.fn(async (_room: string, items: Array<Omit<CatalogItem, "added_at">>) => ({
    items: items.map((i) => ({ folder: null, ...i, added_at: "2026-10-20T10:00:00Z" })),
  })),
  removeFromCatalog: vi.fn(async () => ({ items: [] })),
}));

const app = (m: unknown) => parseCtl(JSON.stringify({ t: "app", m }));

describe("event messages", () => {
  it("parses requests, previews and unavailable notices", () => {
    expect(app({ kind: "event_get", itemId: "it1", requestId: "ev1" })).toEqual({ t: "app", m: { kind: "event_get", itemId: "it1", requestId: "ev1" } });
    expect(app({ kind: "event_thumbs", itemIds: ["a", "b"] })).not.toBeNull();
    expect(app({ kind: "event_thumbs", itemIds: Array.from({ length: 25 }, (_, i) => `i${i}`) })).toBeNull();
    expect(app({ kind: "event_thumb", itemId: "a", data: "data:image/jpeg;base64,AAAA" })).not.toBeNull();
    // Only small JPEG data URLs: nothing that could run or be huge.
    expect(app({ kind: "event_thumb", itemId: "a", data: "data:text/html;base64,AAAA" })).toBeNull();
    expect(app({ kind: "event_thumb", itemId: "a", data: `data:image/jpeg;base64,${"A".repeat(100_000)}` })).toBeNull();
    expect(app({ kind: "event_unavailable", itemId: "a" })).not.toBeNull();
  });

  it("accepts catalog updates from the server", () => {
    const raw = JSON.stringify({
      type: "catalog_updated",
      room_id: "rm_1",
      items: [{ item_id: "a", name: "a.jpg", size: 3, mime_type: "image/jpeg", folder: null, added_at: "x" }],
    });
    expect(parseServerMessage(raw)).toMatchObject({ type: "catalog_updated" });
    expect(parseServerMessage(JSON.stringify({ type: "catalog_updated", room_id: "rm_1", items: [{}] }))).toBeNull();
  });
});

describe("EventShare", () => {
  let hostId = "dv_host";
  const sent: Array<{ to: string; message: AppMessage }> = [];
  const transfers = { send: vi.fn(() => 1) };
  const make = (selfId: string) =>
    new EventShare({
      roomId: "rm_1",
      token: "t",
      selfId,
      hostId: () => hostId,
      messenger: {
        send: vi.fn(async (to: string, message: AppMessage) => {
          sent.push({ to, message });
          return true;
        }),
      } as never,
      transfers: transfers as never,
      notify: vi.fn(),
    });

  beforeEach(() => {
    hostId = "dv_host";
    sent.length = 0;
    transfers.send.mockClear();
  });

  it("guest asks the host for each picked file and accepts only those transfers", async () => {
    const guest = make("dv_guest");
    expect(await guest.download(["it_a", "it_b"])).toBe(2);
    const requests = sent.map((s) => s.message);
    expect(sent.every((s) => s.to === "dv_host")).toBe(true);
    expect(requests.map((m) => m.kind)).toEqual(["event_get", "event_get"]);
    const requestId = (requests[0] as { requestId: string }).requestId;
    expect(guest.isRequested("dv_host", requestId)).toBe(true);
    expect(guest.isRequested("dv_someone_else", requestId)).toBe(false);
    expect(guest.isRequested("dv_host", "ev_not_mine")).toBe(false);
    expect(Object.keys(guest.requests.getSnapshot())).toEqual(["it_a", "it_b"]);
  });

  it("host sends a shared file as a transfer tagged with the guest's request", async () => {
    const host = make("dv_host");
    const file = new File(["hello"], "photo.jpg", { type: "image/jpeg" });
    expect(await host.share([file])).toBe(1);
    const [item] = host.catalog.getSnapshot();
    expect(item).toMatchObject({ name: "photo.jpg", size: 5, mime_type: "image/jpeg" });

    host.handle("dv_guest", { kind: "event_get", itemId: item!.item_id, requestId: "ev_1" });
    await vi.waitFor(() => expect(transfers.send).toHaveBeenCalledWith([file], ["dv_guest"], { batchId: "ev_1" }));
    expect(host.requestItems.get("ev_1")).toBe(item!.item_id);

    // The same request again (e.g. a retry of the message) isn't sent twice.
    host.handle("dv_guest", { kind: "event_get", itemId: item!.item_id, requestId: "ev_1" });
    await Promise.resolve();
    expect(transfers.send).toHaveBeenCalledTimes(1);
  });

  it("host answers 'unavailable' for files it no longer has", async () => {
    const host = make("dv_host");
    host.handle("dv_guest", { kind: "event_get", itemId: "it_gone", requestId: "ev_2" });
    await vi.waitFor(() => expect(sent).toContainEqual({ to: "dv_guest", message: { kind: "event_unavailable", itemId: "it_gone" } }));
    expect(transfers.send).not.toHaveBeenCalled();
  });

  it("guest only takes previews and notices from the host", async () => {
    const guest = make("dv_guest");
    await guest.download(["it_a"]);
    guest.handle("dv_intruder", { kind: "event_thumb", itemId: "it_a", data: "data:image/jpeg;base64,AA" });
    guest.handle("dv_intruder", { kind: "event_unavailable", itemId: "it_a" });
    expect(guest.thumbs.getSnapshot()).toEqual({});
    expect(guest.requests.getSnapshot().it_a?.unavailable).toBe(false);
    guest.handle("dv_host", { kind: "event_thumb", itemId: "it_a", data: "data:image/jpeg;base64,AA" });
    guest.handle("dv_host", { kind: "event_unavailable", itemId: "it_a" });
    expect(guest.thumbs.getSnapshot().it_a).toBe("data:image/jpeg;base64,AA");
    expect(guest.requests.getSnapshot().it_a?.unavailable).toBe(true);
  });

  it("a guest ignores requests meant for the host, and asks for each preview once", () => {
    const guest = make("dv_guest");
    guest.handle("dv_other", { kind: "event_get", itemId: "x", requestId: "ev_3" });
    expect(transfers.send).not.toHaveBeenCalled();
    guest.requestThumbs(["a", "b"]);
    guest.requestThumbs(["a", "b", "c"]);
    expect(sent.map((s) => s.message)).toEqual([
      { kind: "event_thumbs", itemIds: ["a", "b"] },
      { kind: "event_thumbs", itemIds: ["c"] },
    ]);
  });
});

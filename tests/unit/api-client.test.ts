import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "@/lib/api/client";
import { ApiError, userMessage } from "@/lib/api/errors";
import { createRoom } from "@/lib/api/rooms";
import { parseServerMessage } from "@/lib/webrtc/server-messages";

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const envelope = (code: string, message = "msg") => ({ success: false, error: { code, message, request_id: "rq_1" } });

describe("ApiClient", () => {
  it("sends JSON with the bearer token and returns the body", async () => {
    const fetchImpl = vi.fn(async () => response(201, { room_id: "rm_1" }));
    const client = new ApiClient("http://api.test/api/v1", fetchImpl as unknown as typeof fetch);
    const result = await client.request<{ room_id: string }>("POST", "/rooms", { body: { a: 1 }, token: "tok" });
    expect(result.room_id).toBe("rm_1");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/rooms");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it.each([
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "INVALID_ROOM_CODE"],
    [409, "ROOM_FULL"],
    [410, "ROOM_EXPIRED"],
    [500, "INTERNAL_ERROR"],
  ])("maps %i %s from the error envelope", async (status, code) => {
    const client = new ApiClient("http://api.test", (async () => response(status, envelope(code))) as unknown as typeof fetch);
    const error = await client.request("GET", "/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).requestId).toBe("rq_1");
    expect(userMessage(error)).not.toContain("msg"); // friendly copy, not server internals
  });

  it("falls back to status-based codes for non-JSON errors", async () => {
    const client = new ApiClient("http://api.test", (async () => new Response("<html>bad gateway</html>", { status: 502 })) as unknown as typeof fetch);
    const error = (await client.request("GET", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("INTERNAL_ERROR");
  });

  it("honours Retry-After on 429 for retryable calls", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(429, envelope("RATE_LIMITED"), { "Retry-After": "2" }))
      .mockResolvedValueOnce(response(200, { ok: true }));
    const client = new ApiClient("http://api.test", fetchImpl as unknown as typeof fetch);
    const pending = client.request("GET", "/x", { retries: 1 });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: true });
    vi.useRealTimers();
  });

  it("does not retry POSTs by default and reports the wait", async () => {
    const fetchImpl = vi.fn(async () => response(429, envelope("RATE_LIMITED"), { "Retry-After": "30" }));
    const client = new ApiClient("http://api.test", fetchImpl as unknown as typeof fetch);
    const error = (await createRoom({ device_name: "x" }, client).catch((e: unknown) => e)) as ApiError;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error.retryAfter).toBe(30);
    expect(userMessage(error)).toBe("Too many attempts. Try again in 30 s.");
  });

  it("reports network errors", async () => {
    const client = new ApiClient("http://api.test", (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch);
    const error = (await client.request("GET", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("NETWORK_ERROR");
  });
});

describe("parseServerMessage", () => {
  const device = {
    device_id: "dv_aaaaaaaaaaaaaaaaaaaa",
    device_name: "Phone",
    device_type: "phone",
    browser: null,
    operating_system: null,
    joined_at: "2026-01-01T00:00:00Z",
    last_seen: "2026-01-01T00:00:00Z",
    connection_state: "connected",
    is_host: false,
  };

  it("accepts contract messages", () => {
    expect(parseServerMessage(JSON.stringify({ type: "peer_joined", device }))?.type).toBe("peer_joined");
    expect(parseServerMessage(JSON.stringify({ type: "ping", ts: 1 }))?.type).toBe("ping");
    expect(
      parseServerMessage(
        JSON.stringify({ type: "offer", sender_id: "dv_a", target_id: "dv_b", connection_id: "pc-1", payload: { type: "offer", sdp: "v=0" } }),
      )?.type,
    ).toBe("offer");
  });

  it("fills defaults on transfer events", () => {
    const transfer = {
      transfer_id: "tr_1",
      sender_id: "dv_a",
      status: "pending",
      recipients: [{ device_id: "dv_b", status: "pending", received_ranges: [] }],
      file: { file_name: "a", file_size: 1, chunk_size: 1, total_chunks: 1 },
    };
    const parsed = parseServerMessage(JSON.stringify({ type: "transfer_request", transfer }));
    expect(parsed).toMatchObject({ type: "transfer_request", device_ids: [], actor_id: null, reason: null });
  });

  it("drops anything outside the contract", () => {
    expect(parseServerMessage("{")).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "peer_joined" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "bogus" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "offer", payload: { type: "offer", sdp: "x" } }))).toBeNull();
    expect(parseServerMessage(new ArrayBuffer(4))).toBeNull();
  });
});

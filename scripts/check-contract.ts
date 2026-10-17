// Checks this frontend against a running backend: the real API client, signaling client and
// message parser, through the full room → join → signaling → transfer lifecycle (metadata only;
// WebRTC itself needs browsers). Fails if the server sends anything our types don't accept.
//
//   bun scripts/check-contract.ts [http://127.0.0.1:8000]
import { ApiClient } from "@/lib/api/client";
import { getTransferConfig } from "@/lib/api/config";
import { leaveRoom } from "@/lib/api/devices";
import { closeRoom, createRoom, getRoom, joinRoom } from "@/lib/api/rooms";
import { createTransfer, getTransfer, transferAction } from "@/lib/api/transfers";
import { getTurnCredentials } from "@/lib/api/turn";
import { parseServerMessage } from "@/lib/webrtc/server-messages";
import { SignalingClient, type WebSocketLike } from "@/lib/webrtc/signaling-client";
import type { ClientMessage, MessageOf, ServerMessage, ServerMessageType } from "@/types/signaling";

const base = (process.argv[2] ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const api = new ApiClient(`${base}/api/v1`);
const wsUrl = `${base.replace(/^http/, "ws")}/ws/v1`;
const ORIGIN = process.env.CHECK_ORIGIN ?? "http://localhost:3000";

const CLIENT_TYPES = [
  "join", "leave", "ping", "pong", "offer", "answer", "ice_candidate", "connection_state", "transfer_request",
  "transfer_accepted", "transfer_rejected", "transfer_connecting", "transfer_started", "transfer_paused",
  "transfer_resumed", "transfer_completed", "transfer_failed", "transfer_retrying", "transfer_cancelled",
  "transfer_checkpoint",
] as const satisfies readonly ClientMessage["type"][];
const SERVER_TYPES = [
  "room_state", "peer_joined", "peer_updated", "peer_left", "offer", "answer", "ice_candidate", "connection_state",
  "transfer_request", "transfer_created", "transfer_accepted", "transfer_rejected", "transfer_connecting",
  "transfer_started", "transfer_paused", "transfer_resumed", "transfer_completed", "transfer_failed",
  "transfer_retrying", "transfer_cancelled", "transfer_expired", "transfer_checkpoint", "transfer_fallback_ready",
  "ping", "pong", "error", "room_updated", "room_closed", "room_expired",
] as const satisfies readonly ServerMessageType[];

let failures = 0;
function check(condition: unknown, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}`);
  }
}

/** Collects every discriminator value from a JSON Schema (oneOf/anyOf + const/enum/mapping). */
function typeLiterals(schema: unknown): Set<string> {
  const out = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    const disc = n.discriminator as { mapping?: Record<string, string> } | undefined;
    for (const key of Object.keys(disc?.mapping ?? {})) out.add(key);
    const props = n.properties as Record<string, Record<string, unknown>> | undefined;
    const t = props?.type;
    if (t) {
      if (typeof t.const === "string") out.add(t.const);
      if (Array.isArray(t.enum)) for (const v of t.enum) if (typeof v === "string") out.add(v);
    }
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(schema);
  return out;
}

function compare(label: string, server: Set<string>, ours: readonly string[]): void {
  const mine = new Set(ours);
  const missing = [...server].filter((t) => !mine.has(t));
  const extra = [...mine].filter((t) => !server.has(t));
  check(missing.length === 0, `${label}: every server message type is typed${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
  check(extra.length === 0, `${label}: no types the server doesn't have${extra.length ? ` (extra: ${extra.join(", ")})` : ""}`);
}

interface Peer {
  name: string;
  client: SignalingClient;
  received: ServerMessage[];
  dropped: string[];
}

function connect(name: string, roomId: string, token: string): Peer {
  const peer: Peer = { name, client: null as unknown as SignalingClient, received: [], dropped: [] };
  peer.client = new SignalingClient({
    wsUrl,
    roomId,
    token,
    createSocket: (url) => {
      // Bun's WebSocket accepts headers, so the backend sees a browser-like Origin.
      const socket = new WebSocket(url, { headers: { Origin: ORIGIN } } as unknown as string[]);
      socket.addEventListener("message", (event) => {
        if (parseServerMessage(event.data) === null) peer.dropped.push(String(event.data).slice(0, 200));
      });
      return socket as unknown as WebSocketLike;
    },
  });
  peer.client.events.on("message", (message) => peer.received.push(message));
  peer.client.connect();
  return peer;
}

async function waitFor<T extends ServerMessageType>(
  peer: Peer,
  type: T,
  predicate: (m: MessageOf<T>) => boolean = () => true,
  timeoutMs = 5000,
): Promise<MessageOf<T> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = peer.received.find((m): m is MessageOf<T> => m.type === type && predicate(m as MessageOf<T>));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  return null;
}

async function main(): Promise<void> {
  console.log(`Backend: ${base}\n`);

  console.log("WebSocket schema");
  const schema = await api.request<{ client_to_server: unknown; server_to_client: unknown }>("GET", "/ws-schema");
  compare("client → server", typeLiterals(schema.client_to_server), CLIENT_TYPES);
  compare("server → client", typeLiterals(schema.server_to_client), SERVER_TYPES);

  console.log("\nREST: rooms");
  const config = await getTransferConfig(api);
  check(config.recommended_chunk_size > 0 && config.max_recipients > 0, "GET /config/transfer");
  const host = await createRoom({ device_name: "Contract Laptop", device_type: "laptop", browser: "Bun", operating_system: "Test" }, api);
  check(/^[A-Z2-9]{6}$/.test(host.room_code), `room code is 6 characters (${host.room_code})`);
  check(host.join_url.endsWith(`/join/${host.room_code}`), "join_url points at /join/{code}");
  check(typeof host.device_token === "string" && host.device.is_host, "host session has a token");
  const guest = await joinRoom(host.room_code.toLowerCase(), { device_name: "Contract Phone", device_type: "phone" }, null, api);
  check(guest.room_id === host.room_id, "join by code (case-insensitive)");
  const sameGuest = await joinRoom(host.room_code, { device_name: "Contract Phone", device_type: "phone" }, guest.device_token, api);
  check(sameGuest.device.device_id === guest.device.device_id, "re-joining with the token keeps the same device");
  const room = await getRoom(host.room_id, host.device_token, api);
  check(room.devices.length === 2, "GET /rooms/{id} lists both devices");
  const bad = await joinRoom("ZZZZZZ", { device_name: "x" }, null, api).catch((e: unknown) => e);
  check((bad as { code?: string }).code === "INVALID_ROOM_CODE", "invalid code → INVALID_ROOM_CODE");

  console.log("\nREST: TURN");
  const turn = await getTurnCredentials(host.device_token, api).catch((e: unknown) => e);
  check(Array.isArray((turn as { ice_servers?: unknown }).ice_servers) || (turn as { code?: string }).code === "TURN_UNAVAILABLE", "POST /turn/credentials returns ice_servers (or TURN_UNAVAILABLE)");

  console.log("\nWebSocket: join and presence");
  const a = connect("host", host.room_id, host.device_token);
  const b = connect("guest", guest.room_id, guest.device_token);
  const stateA = await waitFor(a, "room_state");
  const stateB = await waitFor(b, "room_state");
  check(stateA && stateB, "both receive room_state after join");
  check(stateA?.self_device_id === host.device.device_id, "room_state.self_device_id is ours");
  const politeA = stateA?.peers.find((p) => p.device_id === guest.device.device_id)?.polite;
  check(politeA === host.device.device_id > guest.device.device_id, "polite flag follows the greater-id rule");

  console.log("\nWebSocket: signaling relay");
  a.client.send({
    type: "offer",
    target_id: guest.device.device_id,
    connection_id: "pc-contract-1",
    payload: { type: "offer", sdp: "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n" },
  });
  a.client.send({ type: "ice_candidate", target_id: guest.device.device_id, connection_id: "pc-contract-1", payload: { candidate: null } });
  const offer = await waitFor(b, "offer");
  check(offer?.sender_id === host.device.device_id, "offer relayed with server-set sender_id");
  check(offer?.payload.sdp === "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n", "SDP relayed byte-for-byte");
  check(await waitFor(b, "ice_candidate", (m) => m.payload.candidate === null), "end-of-candidates relayed");
  a.client.send({ type: "connection_state", target_id: guest.device.device_id, connection_id: "pc-contract-1", state: "connected", path: "lan" });
  check(await waitFor(b, "connection_state"), "connection_state relayed");

  console.log("\nTransfers (10 GB of metadata, no file data)");
  const size = 10 * 1024 ** 3;
  const chunk = config.recommended_chunk_size;
  const created = await createTransfer(
    {
      recipient_ids: [guest.device.device_id],
      file: { file_name: "../../big video.mp4", file_size: size, mime_type: "video/mp4", chunk_size: chunk, total_chunks: Math.ceil(size / chunk) },
    },
    host.device_token,
    api,
  );
  const id = created.transfer_id;
  check(created.file.file_name === "big video.mp4", "server keeps only the base file name");
  check(created.recipients[0]?.status === "pending", "new leg is pending");
  check(await waitFor(b, "transfer_request", (m) => m.transfer.transfer_id === id), "recipient gets transfer_request");
  check(await waitFor(a, "transfer_created", (m) => m.transfer.transfer_id === id), "sender gets transfer_created");

  const forbidden = await transferAction(id, "accept", host.device_token, {}, api).catch((e: unknown) => e);
  check((forbidden as { code?: string }).code === "FORBIDDEN", "sender cannot accept");
  await transferAction(id, "accept", guest.device_token, {}, api);
  check(await waitFor(a, "transfer_accepted", (m) => m.transfer.transfer_id === id), "sender gets transfer_accepted");
  await transferAction(id, "connect", host.device_token, { device_id: guest.device.device_id }, api);
  const started = await transferAction(id, "start", host.device_token, { device_id: guest.device.device_id }, api);
  check(started.recipients[0]?.status === "transferring", "connect → start → transferring");

  b.client.send({ type: "transfer_checkpoint", transfer_id: id, received_ranges: [[0, 511], [520, 600]], last_verified_chunk: 511 });
  const checkpoint = await waitFor(a, "transfer_checkpoint", (m) => m.transfer.transfer_id === id);
  check(JSON.stringify(checkpoint?.transfer.recipients[0]?.received_ranges) === JSON.stringify([[0, 511], [520, 600]]), "checkpoint ranges reach the sender");

  await transferAction(id, "pause", host.device_token, { device_id: guest.device.device_id, reason: "connection_lost" }, api);
  const paused = await waitFor(b, "transfer_paused", (m) => m.transfer.transfer_id === id);
  check(paused?.reason === "connection_lost" && paused.actor_id === host.device.device_id, "pause event carries reason and actor");
  const invalid = await transferAction(id, "start", host.device_token, { device_id: guest.device.device_id }, api).catch((e: unknown) => e);
  check((invalid as { code?: string }).code === "INVALID_STATE", "start from paused → INVALID_STATE (resume is required)");
  await transferAction(id, "resume", guest.device_token, {}, api);
  const done = await transferAction(id, "complete", guest.device_token, {}, api);
  check(done.recipients[0]?.status === "completed" && done.status === "completed", "recipient completes");
  check(await waitFor(a, "transfer_completed", (m) => m.transfer.transfer_id === id), "sender gets transfer_completed");
  check((await getTransfer(id, host.device_token, api)).finished_at !== null, "finished transfer has finished_at");

  console.log("\nLeaving");
  await leaveRoom(guest.room_id, guest.device.device_id, guest.device_token, api);
  check(await waitFor(a, "peer_left", (m) => m.device_id === guest.device.device_id), "others get peer_left");
  await closeRoom(host.room_id, host.device_token, api);
  check(await waitFor(a, "room_closed"), "room_closed on close");

  console.log("\nParsing");
  const dropped = [...a.dropped, ...b.dropped];
  check(dropped.length === 0, `every server message passed the client's runtime checks${dropped.length ? `\n      ${dropped.join("\n      ")}` : ""}`);
  a.client.dispose();
  b.client.dispose();

  console.log(failures === 0 ? "\nContract OK" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("Contract check crashed:", error);
  process.exit(1);
});

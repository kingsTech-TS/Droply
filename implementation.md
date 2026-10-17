# Implementation Plan: Droply Frontend (Next.js P2P File Transfer)

Sources:

- Requirements: [prompt.md](prompt.md)
- Backend (source of truth for every contract): `../Droply-BD/backend`, mainly
  `docs/WEBSOCKET_PROTOCOL.md`, `docs/ARCHITECTURE.md`, `app/schemas/*.py`, `app/api/routes/*.py`,
  `app/core/exceptions.py`, `app/services/transfer_state.py`
- Next.js 16.3 docs bundled in `node_modules/next/dist/docs/` (see [AGENTS.md](AGENTS.md))

> **Core invariant for every phase:** FastAPI is the control plane and WebRTC is the data plane.
> No file byte goes to the API. Files are never fully loaded into memory, never Base64-encoded, and
> never sent as one DataChannel message.

---

## 0. Where the original prompt.md and the backend disagreed

prompt.md says to "follow the backend's exact Pydantic/WebSocket contracts", so where the two
disagreed, **the backend won**. **prompt.md has since been updated to match the backend**
(and the browser limits in §1). This table records what changed and why, because these
differences shape the whole design:

| # | Original prompt.md said | Backend actually does | Frontend decision |
|---|---|---|---|
| 1 | `POST /transfers` takes `files: [...]` | `TransferCreate` takes **one** `file` plus `recipient_ids[]`. A transfer is one file with N recipient "legs". | Selecting 5 files creates **5 transfers**, each with the same recipients. The client groups them into a local `batchId` for the UI (one queue, one "Incoming files" card). |
| 2 | File fields `name`, `size`, `mime_type` | `file_name`, `file_size`, `mime_type`, `chunk_size`, `total_chunks`, `sha256?` (`total_chunks` must equal `ceil(size/chunk)`) | Use the backend names in `types/`. Always send `chunk_size` and `total_chunks`. |
| 3 | Room code `K7X9P` (5 chars) | 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. Join is case-insensitive and ignores dashes/spaces. | Code input: 6 slots, uppercase on input, paste-friendly, shown as `K7X 9PQ`. |
| 4 | `joinRoom()` | `POST /rooms/join` `{room_code, device}` → `RoomSession` with `device_token`. Joining by `room_id` still needs the code. | `/join/[code]` calls `/rooms/join`. The host gets a `RoomSession` from `POST /rooms`. |
| 5 | WS handles `join` | WS URL has no token. The **first message** must be `{type:"join", token}` within 5 s. The server replies `room_state` (peers with `polite` flags, STUN servers, `transfer_config`). | `SignalingClient` sends `join` in `onopen`. Nothing else is sent before `room_state`. |
| 6 | States `queued, requesting, waiting_for_acceptance, accepted, connecting, transferring, paused, completed, failed, cancelled` | Leg states `pending, accepted, rejected, connecting, transferring, paused, completed, failed, retrying, cancelled, expired`, with the transition table in `transfer_state.ALLOWED` | Two-layer state machine (§4.8): `queued`/`requesting` exist only on the client. After that the UI mirrors the server leg status (`pending` → "Waiting for acceptance"). |
| 7 | (not specified) | Recipients must report `complete` (after verification) and `checkpoint` (verified chunk ranges). Either side may `connect/start/pause/resume/fail/retry/cancel`. The sender may target one leg with `device_id`. | Role rules are encoded in `TransferManager`, mirroring the backend. |
| 8 | Product name **SwiftDrop** | Backend plan decision #9: "Product name: **Droply** (confirmed)". Repo is `droply`. | **Droply** (confirmed). Branding lives in one file (`config/brand.ts`), so a later rename is a one-line change. |
| 9 | Error codes 401/403/404/409/429/500 | Uniform envelope `{success:false, error:{code, message, request_id}}` with stable codes (`ROOM_EXPIRED` 410, `INVALID_ROOM_CODE` 404, `ROOM_FULL` 409, `TRANSFER_LIMIT_REACHED` 429, `INVALID_STATE` 409, `RATE_LIMITED` 429 + `Retry-After`, `TURN_UNAVAILABLE` 503, ...) | `ApiError` class keyed on `error.code`, not just the HTTP status. Each code maps to user-facing copy in one table. |
| 10 | (not specified) | Max 20 active transfers per device (`TRANSFER_LIMIT_REACHED`). Max 19 recipients. | The scheduler creates server transfers lazily and keeps ≤ `MAX_ACTIVE_TRANSFERS` (env, default 16) open. See §4.9. |
| 11 | "Trusted-device mode" (optional) | The backend always requires acceptance (`require_recipient_acceptance`). | Implement trust **on the client only**: "Auto-accept from this device for this room session". The recipient's client sends `accept` automatically. Nothing is persisted across rooms. |
| 12 | "temporary link transfer" fallback | R2 cloud fallback exists (`/transfers/{id}/fallback/*`) only if `transfer_config.cloud_fallback_enabled` | Optional Phase 10. Offered only when enabled **and** all P2P/TURN routes failed. |
| 13 | WS reconnect 1→16 s | Docs suggest 0.5→8 s with jitter. Don't reconnect after `4001/4003/4004/4010/4011/4012`. 20 s grace period on the server. | Backoff 0.5, 1, 2, 4, 8, 16 s (cap) ± 20 % jitter, max 8 attempts, then "Connection lost [Retry]". Reset on `room_state`. Close codes handled per §4.2. |

Also worth knowing:

- **`join_url` is built by the backend** from `PUBLIC_FRONTEND_URL`. The QR code encodes `session.join_url` exactly as returned.
- **WS rate limit:** 200 msgs / 10 s per device. 64 KiB per frame. Checkpoints and ICE must be throttled or kept within budget (§4.2).
- **Leaving:** send `leave` over WS (or `DELETE /rooms/{id}/devices/{self}`). This revokes the token for good. Closing the tab without `leave` gives a 20 s grace period, then the device is `disconnected` (it can return for 5 min).

---

## 1. Key technical decisions

These are the decisions that prompt.md leaves open or gets wrong for real browsers. Each one is a recommendation. Change it before Phase 4/5 if you disagree.

1. **Logical chunk ≠ wire frame.** A 4 MiB DataChannel message is not portable. SCTP `maxMessageSize` is ~256 KiB in Chrome and lower in some Safari builds, and large messages block other traffic.
   - **Chunk** (default 4 MiB, from `transfer_config.recommended_chunk_size`, bounded by min/max) is the unit of resume, checkpoint, hashing and storage writes. It is declared to the backend.
   - **Frame** (default 64 KiB, `≤ pc.sctp.maxMessageSize`, tuned live) is one binary DataChannel message: a header followed by a slice of a chunk.
2. **One DataChannel per peer** (`label: "droply"`, ordered, reliable, `binaryType = "arraybuffer"`). String messages are control JSON. ArrayBuffer messages are binary frames. This gives one shared backpressure signal per peer and matches the prompt's `Map<deviceId, RTCDataChannel>`. Concurrent files are multiplexed with a 16-bit `slot` in the frame header.
3. **Connections are created lazily and reused.** A peer connection is created when a transfer leg to or from that peer is accepted (or warmed up when the user ticks the recipient). It is kept open for later transfers and closed after 3 min idle or on `peer_left`. Presence ("● Online") comes from the WS. "⚡ Direct" appears only after stats confirm it. A full mesh on join (up to 19 PCs on a phone) is avoided.
4. **The sender of a transfer is the one that needs a channel and makes the offer.** Perfect negotiation (with the backend's `polite` flag) handles glare when both sides send at once. `connection_id = pc-<peerId>-<n>`, with a new `n` for each new PC or ICE restart. ICE candidates are buffered per `connection_id` until `setRemoteDescription` resolves.
5. **Receiver credit window (receive-side backpressure).** DataChannels have no receive backpressure. If the receiver's disk is slower than the network, its RAM fills up. The receiver acks each chunk once it is verified and persisted. The sender keeps ≤ `W` unacked chunks per leg (default 6 on desktop, 3 on mobile). Receiver memory per leg is therefore ≤ `W × chunkSize` (24 MiB / 12 MiB).
6. **Progress comes from acks only.** Sender progress = bytes of chunks the receiver has acked (verified and written). Receiver progress = bytes it has verified. `bufferedAmount`-based "sent" bytes feed only the throughput estimator, never the progress bar.
7. **Integrity uses per-chunk SHA-256 and a root digest.** Web Crypto cannot hash a stream, and a full-file SHA-256 before sending would mean reading 10 GB twice. Instead:
   - The sender computes `crypto.subtle.digest("SHA-256", chunk)` for each chunk and sends it in `chunk_end`.
   - The receiver checks the digest **before** writing and acking. Only verified chunks go into checkpoint ranges, which is what the backend's "verified ranges" means.
   - At the end, both sides compute `root = SHA-256(concat(chunkDigests))` and compare. A match gives "✓ File verified" and the receiver sends `complete`. A mismatch gives "⚠ File verification failed": the bad chunks are re-requested once, then the leg fails. It is never marked complete.
   - The backend's `sha256` field (full-file hash) is left `null` because it would be dishonest to fill it.
8. **Receiver storage uses progressive enhancement** (`lib/storage/sinks/`):
   1. **Direct-to-disk** (Chromium desktop, opt-in or automatic for files > available quota): `showSaveFilePicker()` in the Accept click handler, then `createWritable({ keepExistingData: true })` with `seek(offset)` writes. No double disk usage. The handle is persisted in IndexedDB for resume (permission re-prompt).
   2. **OPFS** (default where `FileSystemSyncAccessHandle` exists: Chrome/Edge, Firefox 111+, Safari 17+): a dedicated storage worker writes chunks at `index × chunkSize` (random access, so resume works). On completion, "Save" streams the OPFS file into `showSaveFilePicker` if available. Otherwise it uses `URL.createObjectURL(await handle.getFile())`, which is disk-backed. The OPFS file is deleted after saving.
   3. **IndexedDB chunk store** (fallback): one Blob per chunk, assembled with `new Blob(chunkBlobs, {type: "application/octet-stream"})`. The parts are disk-backed Blobs, not one giant array.
   4. **Memory** (last resort, only if ≤ 256 MiB and nothing else works). A warning is shown for larger files.

   Before accepting, `navigator.storage.estimate()` is checked against the total size, and `navigator.storage.persist()` is requested. If the space isn't there, the dialog says so and offers direct-to-disk where possible.
9. **Resume.** IndexedDB keeps per-leg metadata (role, peer, file metadata, chunk size, sink type, verified ranges, chunk digests). It never keeps payloads, except in the IDB fallback sink.
   - **Same page, network blip:** fully automatic.
   - **Receiver reload:** automatic, because chunks are already in OPFS/IDB/disk.
   - **Sender reload:** the `File` object is gone. The UI asks the user to re-select the file. It is matched by name + size + `lastModified`, and the first chunk's digest is checked before resuming. On Chromium, a `FileSystemFileHandle` (from `showOpenFilePicker`) can be persisted to avoid this.
10. **Branding and copy stay honest.** Say "Encrypted in transit (WebRTC/DTLS)", not "end-to-end encrypted". Say "Files go directly between devices when possible; otherwise they're relayed (still encrypted)". Never claim "never touches a server" because TURN exists.
11. **Libraries (minimal):** `next`, `react`, `tailwindcss`, shadcn/ui (Radix), `lucide-react`, `framer-motion` (`motion`), `sonner`, and **`qrcode`** (one small, justified dependency, since a QR encoder is not worth writing by hand). No zod, no state library, no `next-themes`: the small theme provider is hand-written using the Next docs pattern in `02-guides/preventing-flash-before-hydration.md`. Dev only: `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`.
12. **Types are hand-written** in `types/` from the Pydantic models. Inbound WS messages get **runtime type guards** (`parseServerMessage(raw: unknown): ServerMessage | null`), with no `any` and no zod. A dev script (`scripts/check-contract.ts`) fetches `GET /api/v1/ws-schema` and `/openapi.json` and fails if a message type or field name in `types/` is missing or extra.

---

## 2. Architecture

```text
┌──────────────────────────── React (UI only) ─────────────────────────────┐
│  app/ pages · components/ · hooks/ (useSyncExternalStore)                │
└──────────────────▲─────────────────────────────────────▲─────────────────┘
                   │ snapshots (≤ 5 Hz)                  │ commands
┌──────────────────┴──── RoomSession (one per room) ─────┴─────────────────┐
│                                                                          │
│  SignalingClient       PeerManager                TransferManager        │
│  · WS JSON             · RTCPeerConnection +      · state machine        │
│                          RTCDataChannel per peer  · Scheduler            │
│  ApiClient             · ConnectionMonitor        · ProgressStore        │
│  · REST                  (getStats)                                      │
│                                                                          │
│  FileSender / FileReceiver ── ChunkManager ── Sinks ── StorageWorker     │
│  ResumeManager (IndexedDB)                             (OPFS)            │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Services are plain TS classes** with no React imports. Each one exposes `subscribe(listener)` and `getSnapshot()`.
- **`RoomSession`** owns all services for one room. It is created by `RoomSessionProvider` on `/room/[roomId]` and torn down on unmount or room end.
- `File`, `ArrayBuffer`, `RTCPeerConnection` and `RTCDataChannel` live only inside services. React state holds IDs, metadata, status and throttled progress numbers.
- **`ProgressStore`** collects byte counters on every ack. It publishes one immutable snapshot every 200 ms (and pauses while `document.hidden`), so the UI renders at ≤ 5 Hz no matter how fast chunks arrive.

### End-to-end flow (sender A → recipient B)

```text
A: select files ─► batch (client) ─► POST /transfers ×N (metadata) ─► transfer_created
B: transfer_request ×N (debounced 400 ms into one card) ─► Accept ─► POST /transfers/{id}/accept ×N
A: transfer_accepted ─► PeerManager.ensure(B) ─► offer/answer/ICE over WS ─► DataChannel open
A: POST connect ─► ctl:file_open ─► POST start ─► frames ... ◄─ ctl:chunk_ack (credit)
B: every 2 s ─► WS transfer_checkpoint {received_ranges}
B: all chunks verified + root digest ok ─► POST /transfers/{id}/complete ─► "Save"
```

---

## 3. Directory structure

Adjusted from prompt.md §53. Additions are marked `+`.

```text
app/
├── layout.tsx                      # fonts, ThemeProvider, Toaster, brand metadata
├── page.tsx                        # landing: hero, drop zone, join-by-code, how-it-works
├── join/[code]/page.tsx            # server component awaits params → <JoinForm />
├── room/[roomId]/page.tsx          # client shell → <RoomSessionProvider>
├── about/page.tsx                  # (new)
├── dev/benchmark/page.tsx          # notFound() unless NEXT_PUBLIC_ENABLE_BENCHMARK
├── not-found.tsx                   # (new)
├── error.tsx                       # (new)
└── globals.css                     # Tailwind v4 + shadcn tokens

components/
├── layout/
│   ├── header.tsx
│   ├── footer.tsx
│   ├── theme-toggle.tsx
│   └── logo.tsx                    # (new)
├── room/
│   ├── room-header.tsx
│   ├── room-code.tsx
│   ├── qr-code.tsx
│   ├── room-share-panel.tsx        # (new) code + copy + QR + countdown
│   ├── room-countdown.tsx          # (new)
│   ├── device-list.tsx
│   ├── device-card.tsx
│   ├── connection-badge.tsx        # (new) Direct / Internet / Relay + quality
│   ├── connecting-animation.tsx    # (new)
│   ├── room-ended.tsx              # (new)
│   └── unsupported-browser.tsx     # (new)
├── transfer/
│   ├── drop-zone.tsx
│   ├── file-list.tsx
│   ├── file-item.tsx
│   ├── recipient-selector.tsx
│   ├── send-panel.tsx              # (new) queue + recipients + send
│   ├── incoming-transfer.tsx
│   ├── transfer-list.tsx
│   ├── transfer-card.tsx
│   ├── transfer-progress.tsx
│   ├── transfer-details.tsx
│   ├── cancel-dialog.tsx           # (new)
│   ├── resume-reselect-dialog.tsx  # (new)
│   └── storage-panel.tsx           # (new) temporary data + clear
├── dev/
│   └── diagnostics-panel.tsx       # (new)
└── ui/                             # shadcn generated

config/
├── brand.ts                        # (new) product name, taglines
└── env.ts                          # (new) validated NEXT_PUBLIC_* values

lib/
├── api/
│   ├── client.ts
│   ├── errors.ts                   # (new) ApiError + code → copy table
│   ├── rooms.ts
│   ├── devices.ts
│   ├── transfers.ts
│   ├── turn.ts                     # (new)
│   └── config.ts                   # (new)
├── webrtc/
│   ├── signaling-client.ts
│   ├── peer-connection.ts
│   ├── peer-manager.ts             # (new)
│   ├── data-channel.ts
│   ├── protocol.ts                 # (new) frame header + control messages
│   ├── file-sender.ts
│   ├── file-receiver.ts
│   ├── transfer-manager.ts
│   ├── transfer-state.ts           # (new) copy of backend ALLOWED table
│   ├── scheduler.ts                # (new)
│   ├── chunk-manager.ts
│   ├── resume-manager.ts
│   ├── connection-monitor.ts       # (new) getStats → path, RTT, quality
│   ├── adaptive-controller.ts      # (new)
│   ├── ice.ts                      # (new) STUN + TURN merge and caching
│   └── types.ts
├── storage/
│   ├── indexed-db.ts
│   ├── quota.ts                    # (new)
│   ├── storage.worker.ts           # (new) OPFS sync access handle writes
│   └── sinks/
│       ├── sink.ts                 # (new) common interface
│       ├── fs-access-sink.ts       # (new)
│       ├── opfs-sink.ts            # (new)
│       ├── idb-sink.ts             # (new)
│       └── memory-sink.ts          # (new)
├── device/
│   ├── detection.ts
│   └── device-name.ts              # (new)
├── session/
│   ├── room-session.ts             # (new) owns all services for one room
│   └── session-store.ts            # (new) tokens in sessionStorage
└── utils/
    ├── format.ts                   # bytes / speed / ETA, one unit convention
    ├── ranges.ts                   # (new)
    ├── sanitize-filename.ts        # (new)
    ├── throttle.ts                 # (new)
    ├── backoff.ts                  # (new)
    ├── hash.ts                     # (new)
    ├── id.ts                       # (new)
    └── logger.ts                   # (new) dev-only detailed, redacted logs

hooks/
├── use-room-session.ts             # (new)
├── use-room.ts
├── use-signaling.ts
├── use-webrtc.ts
├── use-transfer.ts
├── use-device.ts
├── use-network-status.ts
├── use-page-lifecycle.ts           # (new)
├── use-wake-lock.ts                # (new)
└── use-countdown.ts                # (new)

types/                              # mirrors the Pydantic models exactly
├── room.ts
├── device.ts
├── transfer.ts
├── signaling.ts
└── api.ts                          # (new)

tests/
├── unit/
├── components/
├── webrtc/
├── mocks/                          # rtc.ts, websocket.ts, byte-source.ts
└── e2e/                            # Playwright

scripts/
└── check-contract.ts               # (new)
```

**Next.js 16 notes** (from the bundled docs):

- `params` is a Promise. Type pages with `PageProps<'/join/[code]'>` and `await params` in a server component, then pass plain props to a client component.
- Middleware is now `proxy.ts`. It isn't needed here.
- `NEXT_PUBLIC_*` values are inlined at **build** time, so each environment needs its own build.

---

## 4. Subsystem designs

### 4.1 API client (`lib/api/`)

- `request<T>(method, path, {body, token, signal})` uses `fetch` against `env.apiUrl` with JSON and `Authorization: Bearer`. Responses are typed as `T` and lightly checked.
- `ApiError { status, code: ErrorCode | "NETWORK_ERROR", message, requestId, retryAfter? }` parses the uniform envelope.
- **429:** honour `Retry-After`. Auto-retry once only for idempotent calls (GETs, TURN). Otherwise surface "Too many attempts, try again in Ns".
- **401 / `UNAUTHORIZED`:** the token was revoked. Clear the session and go to "You've left this room".
- **5xx and network errors:** retry GETs with backoff (max 2). POSTs are not retried automatically.
- Functions:
  - `createRoom(device)`, `joinRoom(code, device)` (`/rooms/join`), `getRoom(id)`, `closeRoom(id)`
  - `getDevices(id)`, `leaveRoom(id, selfId)`
  - `createTransfer`, `getTransfer`, `acceptTransfer`, `rejectTransfer`, `connectTransfer`, `startTransfer`, `pauseTransfer`, `resumeTransfer`, `completeTransfer`, `failTransfer`, `retryTransfer`, `cancelTransfer`, `checkpointTransfer`
  - `getTurnCredentials()`, `getTransferConfig()`
- Action calls return `TransferView`. The manager **replaces** its local copy (the server is authoritative).
- **Transport choice:** transfer **actions go over REST** (typed errors, the result is returned to the caller). **Checkpoints go over WS** (frequent, cheap). Events always arrive over WS.

### 4.2 Signaling client (`lib/webrtc/signaling-client.ts`)

- `connect(roomId, token)` opens `${env.wsUrl}/rooms/${roomId}` and sends `join` on open (including `device` updates if the name changed). It resolves on `room_state` and rejects on close before that.
- Typed `on(type, handler)` for every `ServerMessage`. `send(msg: ClientMessage)` checks it is ≤ 60 KiB.
- **Heartbeat:** reply `pong {ts}` to every server `ping`. If nothing has been received for 75 s, treat the socket as dead and reconnect.
- **Outbound budget:** a token bucket at 150 msgs / 10 s, leaving headroom under 200. ICE candidates and checkpoints queue behind it. Checkpoints are coalesced (latest wins per transfer).
- **Close codes:**

  | Code                                    | Action                                                                              |
  | --------------------------------------- | ----------------------------------------------------------------------------------- |
  | `1000`                                  | done                                                                                |
  | `1001`, `4000`, `4008`, abnormal `1006` | reconnect with backoff (for `4008`, start at 4 s)                                   |
  | `4001`                                  | session invalid: go to the re-join screen                                           |
  | `4003`                                  | configuration error (dev log)                                                       |
  | `4004`, `4010`                          | "Room ended"                                                                        |
  | `4009`                                  | bug: log it, reconnect once                                                         |
  | `4011`                                  | "Opened in another tab" + [Use here], which reconnects (and replaces the other tab) |
  | `4012`                                  | "Removed by host"                                                                   |

- **Reconnect:** inside the 20 s grace period, `peer_updated` arrives instead of a leave/join pair. Peer connections may survive a WS blip, so they are not torn down just because the WS dropped.

### 4.3 Peer manager and peer connection

- `PeerManager` holds `Map<deviceId, PeerLink>`. `PeerLink` wraps `{ pc: RTCPeerConnection, channel: RTCDataChannel | null, connectionId, polite, makingOffer, ignoreOffer, pendingIce: Map<connectionId, RTCIceCandidateInit[]> }`.
- `polite`: from `room_state.peers[].polite`, or for later peers `selfId > peerId` (lexicographic), the same symmetric rule as the backend.
- **Perfect negotiation** (MDN pattern) with `onnegotiationneeded`. Relayed `offer`/`answer` messages for an unknown `connection_id` from the same peer replace the old PC (the peer restarted).
- **ICE config:** `room_state.ice_servers` (STUN), merged with `POST /turn/credentials` (fetched once per session, cached until `expires_at − 5 min`, refetched before creating a PC if stale). On `TURN_UNAVAILABLE`, continue with STUN only and log it. Use `iceCandidatePoolSize: 2`. Default bundle policy.
- **Failure ladder:**
  1. `iceConnectionState === "disconnected"` for 5 s → `pc.restartIce()`, with a new `connection_id` suffix.
  2. `failed`, or no recovery within 15 s → close and create a new PC.
  3. After 3 failed attempts → the leg moves to `failed` with reason `no_route`. Show "We couldn't establish a direct connection. [Retry]" and the cloud option if enabled.

  Copy at each step: "Direct connection unavailable. Trying another route…" → "Connected through relay."
- Report `connection_state {state, path}` to the server on each change, once the path is known.
- **Cleanup:** `peer_left`, room end, or idle → `channel.close()`, `pc.close()`, remove the map entries and drop listeners.

### 4.4 Connection monitor (honest path and quality)

- `getStats()` runs every 2 s while transferring, every 10 s otherwise, and is paused while `document.hidden`.
- **Path:** find the selected pair (`transport.selectedCandidatePairId`, or the `candidate-pair` that is `nominated && state==="succeeded"`), then look at its local and remote `candidateType`:

  | Candidate types             | Path      | Label                                 |
  | --------------------------- | --------- | ------------------------------------- |
  | either side `relay`         | `relay`   | "🔄 Relay connection"                  |
  | both `host`                 | `lan`     | "⚡ Direct connection" (local network) |
  | otherwise (`srflx`/`prflx`) | `direct`  | "🌐 Internet connection"               |
  | no selected pair yet        | `unknown` | "Connecting…"                         |

- **Quality:** uses `currentRoundTripTime` and measured throughput.
  - ⚡ Excellent: RTT < 50 ms
  - ● Good: RTT < 150 ms
  - △ Weak: anything else, or throughput stalled for more than 3 s while data is queued

  With no stats, show nothing rather than a guess.
- **Diagnostics values:** RTT, `availableOutgoingBitrate` (where present), `bytesSent`/`bytesReceived` deltas, and the SCTP/data-channel `messagesSent`. Packet loss is shown as "n/a" when the browser doesn't expose it for the transport. It is never invented.

### 4.5 Wire protocol over the DataChannel (`lib/webrtc/protocol.ts`)

**Control messages** are JSON strings, each < 2 KiB, and versioned:

```ts
type Ctl =
  | { t: "hello"; v: 1; maxFrame: number; window: number }
  | { t: "file_open"; slot: number; transferId: string; size: number;
      chunkSize: number; totalChunks: number;
      skip: Array<[number, number]> }                 // ranges the receiver already has
  | { t: "chunk_end"; slot: number; index: number;
      sha256: string }                                // hex digest of that chunk
  | { t: "chunk_ack"; slot: number; index: number }   // verified + persisted
  | { t: "chunk_nack"; slot: number; index: number }  // digest mismatch → resend
  | { t: "file_end"; slot: number; root: string }
  | { t: "file_close"; slot: number;
      reason: "done" | "paused" | "cancelled" | "error" }
  | { t: "resume_req"; transferId: string; have: Array<[number, number]> };
```

**Binary frame:** a fixed 16-byte little-endian header followed by the payload.

```text
offset  type  field
0       u8    magic (0xD7)
1       u8    version (1)
2       u16   slot
4       u32   chunkIndex
8       u32   offsetInChunk
12      u32   payloadLength
16      ...   payload (≤ maxFrame − 16 bytes)
```

`slot` maps to `transferId` and `totalChunks` through `file_open`, so the `transfer_id`, `file_id`, chunk index and total are all identifiable without repeating long strings in every frame. **`fileId` = backend `transfer_id`**, because one transfer is one file. The receiver validates everything:

- magic and version match
- the slot is known
- the index is below `totalChunks`
- `offset + len ≤ chunkLen`
- no overlap within a chunk

A malformed frame closes the slot with `error`.

### 4.6 File sender (`file-sender.ts`) with backpressure and adaptive tuning

```text
for each leg slot (scheduler picks the next slot round-robin):
  while credit > 0 and nextChunk exists:
    buf = await source.slice(start, end).arrayBuffer()  // one chunk; next one prefetched
    digest = await crypto.subtle.digest("SHA-256", buf)
    for each frame of buf:
      if channel.bufferedAmount > highWater:
        await once(channel, "bufferedamountlow")
      channel.send(frameWithHeader)                     // one copy: header + subarray
    send chunk_end; credit--
  on chunk_ack: credit++, ackedBytes += len, resume loop
```

- `channel.bufferedAmountLowThreshold = highWater / 2`. The sender never calls `send` without checking `bufferedAmount`. On pause or cancel, the loop finishes the in-progress chunk, emits `file_close`, and keeps unacked chunks for re-send.
- `ByteSource` interface (`size`, `slice(a, b): Blob-like`) wraps a `File`. A `SyntheticSource` produces deterministic bytes for tests and benchmarks, so there are no fixtures.
- Multiple recipients: each leg reads its own slices. The OS file cache makes repeat reads cheap. A global limit of ≤ 4 concurrent `arrayBuffer()` reads bounds RAM.

**AdaptiveController** (one per peer):

- Inputs: `bufferedAmount` drain rate (throughput), RTT from the monitor, PC state, and ack latency.
- It controls:
  - `highWater`: start at 1 MiB, then `clamp(2 × throughput × RTT, 256 KiB, 8 MiB)`. It grows by at most ×1.5 per 1 s window and only when the buffer drained to 0 (sender-starved) **and** throughput rose. It halves on a stall.
  - `maxFrame`: 16 KiB on Safari or unknown `maxMessageSize`, otherwise 64 KiB. It can rise to `min(256 KiB, maxMessageSize)` if the throughput gain is ≥ 10 %.
  - Credit window `W`.
- **Chunk size is fixed per transfer** because it is declared to the backend. It is chosen at creation from the last measured throughput to that peer: < 5 MB/s → 1 MiB, < 50 MB/s → 4 MiB, ≥ 50 MB/s → 8 MiB. It is clamped to `transfer_config` min/max and defaults to the recommended size.
- Chrome closes channels whose buffer exceeds ~16 MiB, so `highWater` is hard-capped at 8 MiB.

### 4.7 File receiver (`file-receiver.ts`)

1. On `file_open`: validate it against the server `TransferView` (size, chunk size, total, sender). Ignore anything for transfers this device didn't accept. Open the sink chosen at accept time and load existing ranges from `ResumeManager`.
2. Frames go into a pooled `Uint8Array(chunkSize)`. The pool size is `W`, so memory is bounded.
3. On `chunk_end`: compute the digest and compare. On a match, `sink.write(index, buf)` (transferred to the storage worker with zero copy), then record the range and digest in IndexedDB, send `chunk_ack`, and add the bytes to verified. On a mismatch, send `chunk_nack`. After 3 mismatches the leg fails.
4. Every 2 s (and on pause), send a WS `transfer_checkpoint` with the merged inclusive ranges (≤ 1024, which `lib/utils/ranges.ts` guarantees) and `last_verified_chunk`.
5. On `file_end`: check every chunk is present, compute the root digest and compare. Show "Verifying…". If it matches, `POST complete`, then `sink.finalize()`, mark the transfer ready, and show the "Open / Save" button. Otherwise `fail` with reason `integrity`.
6. **Save:**
   - Uses the browser's normal download path with the sanitized filename and `application/octet-stream` (the sender's MIME type is not trusted).
   - Never navigates away. Never auto-opens or previews.
   - Revokes object URLs after 60 s.
   - Cleans temporary data after a successful save, or offers "Clear temporary data".

### 4.8 Transfer manager and state machine (`transfer-manager.ts`, `transfer-state.ts`)

- **Client states:** `queued → requesting →` (the server leg status from then on): `pending` ("Waiting for acceptance"), `accepted`, `connecting`, `transferring`, `paused`, `retrying`, `completed`, `failed`, `rejected`, `cancelled`, `expired`.
- `transfer-state.ts` copies `ALLOWED` from `transfer_state.py` exactly, plus `queued→requesting→pending|failed`. A table-driven test covers every pair.
- **Invalid local transitions throw in dev and are ignored and logged in prod.** Server events always win: `applyServerView(view)` replaces the leg status even if the local optimistic state differs.
- **Local sub-flags** (not states): `verifying`, `awaitingReselect`, `saving`, `saved`.
- **Who calls what:**

  | Role      | Actions                                                                                             |
  | --------- | --------------------------------------------------------------------------------------------------- |
  | sender    | `connect` when the PC is starting, `start` on the first frame, `pause`, `resume`, `cancel`, `retry` |
  | recipient | `accept`, `reject`, `complete`, `checkpoint`, `pause`, `resume`, `cancel`                           |

  Either side reacts to the other side's events (e.g. recipient pause → the sender's loop stops on `transfer_paused`).
- Server-driven `paused` (the peer's WS dropped past the grace period) stops sending without destroying anything. On `peer_updated` or `peer_joined`, the manager offers or auto-runs resume.

### 4.9 Scheduler and multi-file / multi-recipient

- A **batch** is the files the user picked plus the recipients. Each file becomes one server transfer with `recipient_ids = selected`.
- **Server creation is lazy:** at most `MAX_ACTIVE_TRANSFERS` (default 16, below the backend's 20) unfinished transfers per device. The rest stay `queued` and are created as earlier ones finish. For more than 16 files, the UI says "Sending in groups of 16", and the recipient's incoming card offers **"Auto-accept the rest from this device"** (client trust, §0 #11).
- **Send concurrency:** ≤ 2 files in flight per peer, and ≤ 4 legs globally (≤ 2 on mobile). Each leg is independent: one recipient being slow or paused doesn't stall the others.
- **Incoming grouping:** `transfer_request` events from the same `actor_id` within a 400 ms window become one "Incoming files" card. Accept / Decline acts on the whole group. Per-file decline is available through an expander.

### 4.10 Resume manager (`resume-manager.ts`, `lib/storage/indexed-db.ts`)

- IndexedDB `droply` v1. Stores:
  - `legs` (key `transferId:deviceId`): role, peerId, roomId, file metadata, chunkSize, sinkType, verified ranges, `chunkDigests` (array of hex strings), `updatedAt`
  - `handles`: persisted FS handles
  - `chunks`: only for the IDB sink
- Entries expire after `transfer_config.resume_window_seconds`. Cleanup runs at startup and is listed in the Storage panel.
- **Resume handshake** after reconnect:
  1. The receiver sends `resume_req {have}`.
  2. The sender also cross-checks `GET /transfers/{id}` → `recipients[].received_ranges`.
  3. The sender re-opens the slot with `skip = have` and calls `POST resume` (from `paused`), or `retry` → `start` (from `failed`).
  4. A toast shows "↻ Resuming transfer".

### 4.11 Browser lifecycle and network

- `online`/`offline` → banner "Connection interrupted". State is never torn down. Reconnect when back online.
- `visibilitychange`: hidden → pause stats polling and UI ticks. Visible → `getRoom` (refresh `expires_at`), check the WS, and restart ICE if the PC was `disconnected`.
- `pagehide`/`freeze` → flush the checkpoint and IndexedDB state. `beforeunload` warns only while a transfer is active.
- **Screen Wake Lock** (`navigator.wakeLock.request("screen")`) while transferring, where supported, re-acquired on visible. A hint is shown on mobile: "Keep this tab open until the transfer finishes."

### 4.12 Device detection (`lib/device/detection.ts`)

- `detectDevice(): { type: DeviceType; browser: string; os: string }` uses `navigator.userAgentData` (`mobile`, `platform`, brands) when available and parses the UA otherwise.
- iPadOS reports as Mac, so "Macintosh + `maxTouchPoints > 1`" is treated as a tablet.
- Phone vs tablet: UA mobile flags plus a short-side screen size check.
- **Laptop vs desktop can't be detected reliably:** macOS → laptop. Windows/Linux → laptop if `navigator.getBattery()` reports a battery that isn't (charging at 100 %), otherwise desktop. This is clearly UI-only, the user can edit it, and it is never used for security.
- **Default name:** `"<OS> <type>"`, e.g. "iPhone", "Windows Laptop". The last-used name is remembered in `localStorage`. Names are trimmed to 64 characters (the backend `ShortText` limit).

### 4.13 Security (client side)

- **Never trust** names, MIME types, codes or metadata. React text rendering only. No `dangerouslySetInnerHTML` anywhere (enforced by an ESLint rule).
- `sanitizeFileName`:
  - take the last path component
  - strip control and bidi characters and `<>:"/\|?*`
  - avoid Windows reserved names (`CON`, `NUL`, ...)
  - remove trailing dots and spaces
  - limit to 255 UTF-8 bytes, with fallback `download`
  - de-duplicate as `name (1).ext` within a batch
- Downloads are always `application/octet-stream`. Received files are never executed, previewed or rendered.
- **Tokens:**
  - The device token is kept in `sessionStorage` (`droply:session:<roomId>`), so it survives a reload in the same tab but not new tabs. It is never put in URLs or logs.
  - Logging out or leaving clears it.
  - The redacting `logger` removes `token`, `sdp` and `candidate` fields.
- **Room code input:** only the allowed alphabet, 6 characters. Show `INVALID_ROOM_CODE` and lockout messages without leaking which part was wrong.
- **Production CSP** (via `next.config.ts` headers): `connect-src` limited to the API and WS origins. No inline script apart from the theme bootstrap (hash or nonce).

### 4.14 Diagnostics (`NEXT_PUBLIC_DEBUG=true`)

A collapsible panel on the room page, per peer:

- peer id, `connectionState`, `iceConnectionState`, selected candidate types and path
- DataChannel `readyState`, `bufferedAmount`, `highWater`, `maxFrame`, credit window
- current throughput, RTT, packets lost (or n/a)
- WS state, reconnect attempts, outbound budget

It is tree-shaken out of the bundle when the flag is false (`if (env.debug)` behind a dynamic import).

---

## 5. Pages and UX

| Route | Contents |
|---|---|
| `/` | Header (logo, How it works, About, theme toggle). Hero "Send anything. Instantly." **Drop zone and [Select files]** (drop or select → `createRoom` → move to `/room/[id]` with the files carried in the in-memory `PendingFilesStore`, never serialized). "─ OR ─ Join with a room code". "Built for speed" (4 cards, honest copy). "How it works" (01 / 02 / 03 with Lucide icons). Footer. |
| `/join/[code]` | "Join Droply · Room K7X 9PQ". Device name input (pre-filled, editable) with the detected type icon. [Join room]. Errors: invalid or expired code (with [Create new room]), room full, rate-limited. |
| `/room/[roomId]` | If there is no session token: "You're not in this room" + code input. Unsupported WebRTC → `unsupported-browser`. Otherwise **desktop (≥1024px)** is a two-column layout: the left column has the share panel (code, copy, QR, "Room expires in mm:ss") and the device list. The right column has the drop zone, send panel (queue + recipients) and transfers. **Mobile** is one column: "N devices connected", drop zone, devices, transfers. The share panel is collapsible, and opens by default when the user is alone in the room. |
| `/about` | Short explanation of the control and data planes, privacy caveats (TURN relay, DTLS). |
| `/dev/benchmark` | Gated. **Loopback mode:** two PCs in one page, no backend, measures the pipeline. **Peer mode:** pick a device in the current room and send N GB from a `SyntheticSource`, discarding on receipt. Live: path, RTT, throughput, bufferedAmount, packet loss. Controls: chunk size, frame size, highWater, window, concurrency, UI tick rate. |

**UX details:**

- **Device cards:** type icon, name, "OS • Browser", status as a dot **plus text** ("Online", "Reconnecting…", "Offline"), connection badge once known, and [Send files]. The current device is labelled "This device".
- **Send panel:** "Files ready to send" list (icon by MIME type and extension, size, remove ×), "Send to" checkboxes with Select all / Clear all, auto-selected when there is one peer, and [Send N files]. The button stays disabled with a reason ("Choose a recipient").
- **Transfer card:** name, status text, progress bar (`role="progressbar"`, `aria-valuenow`), "2.30 GB / 2.80 GB", speed, ETA, and buttons Pause/Resume/Cancel/Retry/Save. An expandable "Transfer details" shows path, current/average speed, latency, transferred bytes and remaining time.
- **Units:** decimal (kB, MB, GB, MB/s) everywhere through `lib/utils/format.ts`.
  - Current speed: 3 s EWMA of acked bytes.
  - Average speed: total ÷ active time (excluding paused time).
  - ETA: shown only after 2 s of data, as "~6 seconds".
- **Cancel confirmation** (AlertDialog) when the transfer is `transferring`/`paused` and > 100 MB: "Cancel this transfer? The transfer can no longer be resumed. [Keep transfer] [Cancel]".
- **Toasts (Sonner), sparing:**
  - connected to peer (first time only)
  - transfer complete (batch-level: "3 files received")
  - connection interrupted
  - resuming
  - failed

  Dev details go to the logger, never to the toast text.
- **Error states:** room expired, device disconnected [Retry], WebRTC failure copy ladder, transfer interrupted ("1.8 GB of 4 GB transferred. [Resume]"), and browser unsupported.
- **Animations** (Framer Motion, `useReducedMotion` respected):
  - device enter/exit (`AnimatePresence` + layout)
  - room-created QR fade/scale
  - drop zone drag state
  - connecting line animation (💻 ── 📱)
  - completion check

  The progress bar width is a plain CSS transition. Framer Motion is never driven by progress ticks.
- **Accessibility:**
  - Everything is reachable by keyboard. Visible focus rings. 44px touch targets.
  - The drop zone is a labelled region with a real `<button>` for "Select files" plus a folder button where `webkitdirectory` is supported.
  - `aria-live="polite"` region for status changes (not per-tick progress). Colour is never the only signal. WCAG AA contrast in both themes.
- **Responsive targets:** 320 / 375 / 768 / 1024 / 1280 / 1440 px with no horizontal scroll. Long names use `truncate` + `title`, with `min-w-0` on flex children.
- **Folders:** the backend keeps only the last path component, so v1 flattens folders and de-duplicates names. Structure-preserving receive with `showDirectoryPicker` is a later enhancement.

---

## 6. Phased implementation plan

Each phase ends with **exit criteria** that must pass before the next phase starts.

### Phase 1: Foundation

- `bun add` the runtime libraries from §1 #11. Run `bunx shadcn@latest init` (Tailwind v4) and add: button, card, input, checkbox, dialog, alert-dialog, progress, badge, tooltip, separator, scroll-area, switch, sonner, sheet, collapsible.
- tsconfig: `allowJs: false`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`. ESLint: `@typescript-eslint/no-explicit-any: error`, ban `dangerouslySetInnerHTML`, `readAsDataURL` and `btoa` (no-restricted-syntax).
- `config/brand.ts`, `config/env.ts`, `.env.example` (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_DEBUG`, `NEXT_PUBLIC_ENABLE_BENCHMARK`, `NEXT_PUBLIC_MAX_ACTIVE_TRANSFERS`).
- Theme tokens (slate background, violet/indigo primary, electric-blue accent, green/amber status), theme provider with no flash, layout, header and footer.
- `types/*` mirroring the Pydantic models. `lib/api/*` with `ApiError`. `scripts/check-contract.ts`.
- Vitest setup.

**Exit:** `bun run build`, `lint` and `tsc --noEmit` are clean. `check-contract` passes against a running backend. The API client has unit tests for the error envelope, 429 `Retry-After` and 401 handling.

### Phase 2: Rooms

- Landing page (hero, drop zone UI, join-by-code), `createRoom`, session store, `/join/[code]` with device detection and an editable name, `/room/[roomId]` shell.
- Room code display and copy, QR from `join_url` (`qrcode` → SVG via `<img src=data:…>`), and a countdown (`expires_at`, refreshed by `getRoom` every 60 s and on visibility).
- Room expired and invalid code screens. Carry selected files from `/` into the room without serializing them.

**Exit:** create a room on the laptop, scan the QR on the phone, the phone opens `/join/CODE` and joins. Both are in the same room per `GET /rooms/{id}`.

### Phase 3: WebSocket and presence

- `SignalingClient` (join-first, typed guards, pong, budget, backoff, close codes), `RoomSession`, `useRoomSession`.
- Device list and cards live from `room_state`, `peer_joined`, `peer_updated` and `peer_left`, with animations. `room_closed`/`room_expired` handling. Leave room. Host "Close room".

**Exit:** with 3 devices, joining, leaving, killing a tab (grace → reconnecting → offline) and reconnecting within 20 s (no duplicate) all behave correctly. Tests cover the WS mock for every close code.

### Phase 4: WebRTC

- `ice.ts` (STUN + TURN merge and caching), `PeerManager`/`PeerLink` with perfect negotiation, candidate buffering, the DataChannel `hello` exchange, `ConnectionMonitor` (path and quality), the `connection_state` report, the failure ladder, and cleanup.
- Diagnostics panel (dev).

**Exit:**
- Laptop and phone on the same Wi-Fi reach "⚡ Direct connection" (stats show host/host).
- With phone data on and Wi-Fi off, the path reads "🌐 Internet" or "🔄 Relay" correctly (with TURN configured on the backend).
- Glare test: both sides call `ensure()` at the same time and end with one PC each side.

### Phase 5: File transfer

- `protocol.ts`, `ByteSource`, `FileSender` (chunk/frame, backpressure, credit window), `FileReceiver`, sinks (OPFS worker + memory first, then IDB, then FS Access), per-chunk hashing and the root digest, and `ProgressStore`.
- `TransferManager` (create → accept → connect → start → complete), the send panel, recipient selector, incoming card, transfer card and progress.

**Exit:**
- A 5 GB file transfers laptop → laptop and verifies.
- Sender and receiver tab memory (Chrome Task Manager) stays < ~300 MB throughout.
- Throughput is shown and progress matches acked bytes.
- The 1 GB benchmark on loopback reaches ≥ 100 MB/s on desktop Chrome.

### Phase 6: Reliability

- Pause/resume (both sides), cancel with confirmation, `ResumeManager` and the resume handshake, ICE restart and PC recreation mid-transfer, server-driven pause on WS loss, sender re-select flow, integrity-failure handling (nack/resend, then fail), checkpoints, offline/online handling, wake lock, and the storage panel.

**Exit:**
- Toggling Wi-Fi off/on at ~60 % resumes without re-sending verified chunks (check with diagnostics byte counters).
- Reloading the receiver tab resumes.
- Reloading the sender asks for re-select, then resumes.
- A corrupted chunk (test hook) is detected, resent, and the file verifies.

### Phase 7: Multi-device

- Multi-recipient legs, batches with lazy server creation (cap), the scheduler's concurrency limits, incoming request grouping, the auto-accept trust toggle, and per-leg controls (`device_id` targeting).

**Exit:**
- 1 sender sends 3 files to 3 recipients. One recipient declines, one pauses midway, one completes. Each leg behaves independently and the server statuses match.
- 40 files are sent in groups without `TRANSFER_LIMIT_REACHED`.

### Phase 8: Polish

- Responsive pass at all breakpoints, animations with reduced-motion handling, an accessibility audit (axe in Playwright, plus keyboard-only and VoiceOver/TalkBack spot checks), every error state, toast pruning, the About page, metadata and icons, and CSP headers.

**Exit:** no horizontal scroll at 320 px. axe reports no serious or critical issues. Lighthouse accessibility ≥ 95.

### Phase 9: Testing and benchmarks

See §7. Finish the `/dev/benchmark` page and record tuned defaults (chunk, frame, highWater, window, concurrency, tick) in `config/transfer-defaults.ts`.

### Phase 10 (optional): Cloud fallback

Only when `transfer_config.cloud_fallback_enabled` is true and P2P has failed: single or multipart presigned PUT straight to R2 (the client never proxies through Next or FastAPI), `transfer_fallback_ready` → download URL. Gated behind its own flag. The copy says the file is temporarily stored in the cloud.

---

## 7. Testing strategy

| Layer | Tooling | What |
|---|---|---|
| Unit | Vitest | `transfer-state` (every state pair against a copy of the backend `ALLOWED`), `ranges` merge/split/≤1024, `protocol` header encode/decode + malformed frames, `sanitizeFileName`, `format`, `backoff`, `detectDevice` UA table, `AdaptiveController` (deterministic inputs → bounded outputs, never > cap), `parseServerMessage` guards |
| WebRTC | Vitest + `tests/mocks/rtc.ts` (FakeRTCPeerConnection / FakeRTCDataChannel pair with a simulated `bufferedAmount`, drain rate and `bufferedamountlow`) + fake WebSocket | offer/answer/ICE (including early candidates), glare with polite/impolite, channel open/close, transfer start, chunk sending never exceeding highWater, credit window respected, pause/resume/cancel, resume skipping ranges, nack resend, PC failure → ladder |
| Transfer simulations | Vitest + `SyntheticSource` | 100 MB real bytes through the fake channel with digest verification. "1 GB" and "10 GB" as **metadata simulations** (chunk accounting, ranges and progress without allocating payloads). Multiple files, multiple recipients, `TRANSFER_LIMIT_REACHED` batching. No large fixtures in the repo. |
| Components | Testing Library | drop zone (drag, keyboard, button), file list remove, device card states and accessible text, transfer card buttons per state, progress `aria-*`, room code copy, recipient selector (select all, clear, auto-select single) |
| E2E | Playwright: two browser contexts (and Chromium + Firefox + WebKit) against a local backend (`uvicorn`, memory mode) | create → join via URL → devices appear → send 50 MB synthetic → accept → verify → save. Decline. Room expiry (`ROOM_TTL_SECONDS=60`). Reconnect within grace. Phone viewports (iPhone SE, Pixel 7, iPad). |
| Manual matrix | real devices | iOS Safari 17+, Android Chrome, desktop Chrome/Edge/Firefox/Safari. LAN, cross-network and TURN-only (`iceTransportPolicy: "relay"` dev toggle). 5–10 GB file on desktop. Background a phone mid-transfer. |

---

## 8. Local development setup (important for phone testing)

- **Backend:** `cd ../Droply-BD/backend && uvicorn app.main:app --reload --host 0.0.0.0`. Set `CORS_ORIGINS` (also the WS origin allow-list) and `PUBLIC_FRONTEND_URL` to the frontend origin the phone will use.
- **Phones need HTTPS.** `crypto.subtle`, OPFS, `navigator.storage` and Wake Lock exist only in secure contexts, and `http://192.168.x.x` is not one. Use `next dev --experimental-https` (or mkcert). The backend must also be served over TLS (`uvicorn --ssl-keyfile/--ssl-certfile`, or a local reverse proxy), otherwise the HTTPS page can't open `ws://` (mixed content). Point `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` at the LAN IP or hostname, not `localhost`.
- Add a `dev:https` script and a short "Testing on your phone" section to the README.

---

## 9. Risks and open questions

1. **iOS Safari limits.** Large downloads may be capped by device storage. Backgrounding kills WebRTC within seconds, which the resume flow covers. OPFS sync handles need iOS 17+, with IDB as the fallback. Expect lower throughput (16 KiB frames).
2. **Sender reload needs re-selection** of the file. This is unavoidable without the File System Access API.
3. **Double disk usage with OPFS** (OPFS copy plus saved copy) until saved and cleared. Direct-to-disk avoids it on Chromium.
4. **Whole-file `sha256`** is not sent to the backend (§1 #7). If the backend team wants it, it would need a second read pass or a streaming SHA-256 written in TS (~150 lines) running in a worker.
5. **The backend doesn't push sliding `expires_at` updates,** so the countdown is refreshed by polling `GET /rooms/{id}`. If the backend adds `expires_at` to `peer_updated`/`ping`, switch to that.
6. **Folder structure** is lost because the backend sanitizes to the basename. Preserving it would need a relative-path field in the backend metadata, or sending it over the P2P control channel (sanitized).
7. **TURN availability** depends on backend config (`TURN_PROVIDER=none` by default). Without TURN, cross-network transfers behind symmetric NAT will fail. The UI must say so honestly.

---

## 10. Implementation status

Phases 1–9 are implemented. Phase 10 (cloud fallback) is not.

### Verification

| Check | Result |
|---|---|
| `bun run typecheck`, `bun run lint`, `bun run build` | Clean |
| `bun run test` (Vitest) | 261 tests (236 originally, plus the idea.txt features): unit (all 121 state-machine pairs vs the backend's `ALLOWED`), WebRTC (fake `RTCPeerConnection`: offer/answer/ICE, glare, early candidates, restart), pipeline (backpressure bound, credit window, corruption resend, resume gaps, pause, interruption), end-to-end `TransferManager` pairs against an in-memory backend (multi-file, multi-recipient, decline, per-device limit, pause/resume, link drop + auto-resume, cancel), components |
| Memory | 64 MiB and 512 MiB synthetic transfers peak at 54 MiB and 42 MiB of live buffers: bounded, independent of file size |
| `bun run check-contract` against the real backend | 37/37: WS schema types match exactly, rooms, join, TURN, relay, the full transfer lifecycle, checkpoints, roles, close |
| Playwright in real Chrome (desktop + Pixel 7 viewport) | 14 tests. Create room → join via link → accept → 9 MB over a real DataChannel → "File verified" → download's SHA-256 matches; decline; invalid code; no horizontal scroll; text drop, chat and speed test; pairing then meeting without a code, with scheduled auto-send; personal room link |

Throughput on real devices still needs measuring. On the development machine, even a raw
DataChannel loopback in headless Chrome was capped at ~1.6 MB/s by the environment, and Droply
matched that ceiling. Use `/dev/benchmark` on real hardware to tune the defaults.

### Differences from this plan

1. **Resume handshake:** instead of `resume_req`, every `file_open` is answered with
   `file_ready { have, window }`. The receiver states which chunks it holds and how many
   unacknowledged chunks it accepts, and the sender uses `min(own window, receiver window)`.
   Also added: `file_done { ok }` (root digest result) and `bye` (an intentional close, so
   the peer doesn't try to recover).
2. **Frame size** is fixed per link at `min(64 KiB, the peer's limit, SCTP maxMessageSize)`, or
   16 KiB when the size is unknown. There is no live frame-size probing; the send buffer
   (high-water mark) is what adapts at runtime.
3. **shadcn/ui** components were written by hand in shadcn's style on `radix-ui`, because the
   CLI couldn't reach `ui.shadcn.com` from the build machine.
4. **`exactOptionalPropertyTypes`** is not enabled; it conflicts with Radix and shadcn prop
   types. Every other strict flag is on.
5. **Folders** now keep their structure: `file_open.path` carries the relative path over the
   DataChannel, sanitized on receipt (`sanitizeFolderPath`). File names are still
   de-duplicated as `name (1).ext`.
6. **Direct-to-disk** uses one folder picker per incoming batch (`showDirectoryPicker`), not
   one save dialog per file. Folder access doesn't survive a reload, so those chunks restart
   in browser storage.
7. **Not implemented:** cloud fallback (Phase 10) and a per-device "peer mode" on the
   benchmark page. The benchmark runs in loopback only.

### idea.txt features

Implemented across both repositories (see the README's feature list):

| Area | Frontend | Backend |
|---|---|---|
| My devices, personal room link | `lib/pairing/`, `/my-devices`, `/r/[key]`, pairing over the DataChannel (`pair_request`/`pair_accept`), `trustAll` auto-accept, scheduled send | `POST /api/v1/rendezvous`: HMAC of the key → current room, CAS claim |
| Nearby rooms | `NearbyRooms` (polls every 8 s), host switch | `GET /api/v1/rooms/nearby`, opt-in `discoverable`, keyed IP hash |
| Event rooms, themes | Host settings, banner, delivery roster, recipient groups of `max_recipients` | `kind: event` (50 devices), `theme`, `PATCH /rooms/{id}`, `room_updated` |
| Text, chat, reactions | `{t:"app"}` control messages, `PeerMessenger` | none (peer-to-peer only) |
| Speed | `SpeedMeter` peak/history, gauge, sparkline, summary, speed test (`file_open.test`, `DiscardSink`) | none |
| Media, folders, zip | magic-byte sniffing, album, `file_open.path`, STORE/ZIP64 writer, photo compression | none |
| PWA | `app/manifest.ts` share target, `public/sw.js`, generated icons | none |
| Local only | history, records, badges, stats, preferences, fun names | none |
| Trust | security code from DTLS fingerprints, relay-only retry, `/privacy` | none |

Not built: translations (needs the target languages), a browser extension (separate store
product) and the encrypted "leave it for later" cloud copy (needs R2 enabled and a backend
model for offline recipients).

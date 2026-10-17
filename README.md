# Droply

**Send anything. Instantly.** Fast, private file sharing between your devices.

Droply is a web-based AirDrop / Quick Share. You open the site on two devices (phone, tablet,
laptop or desktop), connect them with a room code or QR code, and send files of any type or
size directly from one browser to the other. Nothing to install.

This repository is the **frontend** (Next.js). The backend lives in `../Droply-BD/backend`.

- **Backend (control plane):** FastAPI creates rooms, identifies devices, relays WebRTC
  signaling and tracks transfer state.
- **Browsers (data plane):** file bytes go directly between browsers over a WebRTC
  DataChannel. A 10 GB file is a few kilobytes of JSON on the server and never an upload.

Requirements: [prompt.md](prompt.md) · Design and decisions: [implementation.md](implementation.md)

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [How a transfer works](#how-a-transfer-works)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Testing on a phone](#testing-on-a-phone)
- [Scripts](#scripts)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Backend integration](#backend-integration)
- [Security and privacy](#security-and-privacy)
- [Browser support](#browser-support)
- [Status and limitations](#status-and-limitations)

## Features

**Rooms and devices**

- Drop or select files on the home page: a room is created and opened immediately. Or create
  an empty room to receive.
- Each room has a 6-character code, a copyable join link, and a QR code generated in the
  browser. The room shows a countdown to its expiry, which the server extends while you're
  active.
- Joining by `/join/CODE` (what the QR code opens) or by typing the code. Codes are
  case-insensitive, and dashes or spaces are ignored.
- The device type (phone, tablet, laptop, desktop), OS and browser are detected for display
  only, and the device name can be edited.
- A live device list shows presence (Online, Reconnecting, Offline) as text, not just color.
- The host can remove any device (with a confirmation) or close the room for everyone. Any
  device can leave.
- **Your active rooms:** leaving a room (rather than the host closing it, or being removed)
  keeps it on the home page while it's open, with *Rejoin*. The creator keeps a private host
  key from creating the room and comes back as host.

**Sending and receiving**

- Multiple files, drag and drop, and folder selection where the browser supports it.
- Choose recipients, with Select all and Clear all. When only one device is online, it's
  selected automatically.
- Recipients must accept. Requests that arrive together are grouped into one "Incoming files"
  card. An optional "auto-accept from this device in this room" switch skips the prompt.
- One file can go to several recipients, and each recipient progresses independently.
- Pause, resume, cancel (with a confirmation for large active transfers), retry and dismiss.
- Received files are saved with the browser's normal download, or straight into a folder you
  pick (Chromium), when browser storage is too small.

**Speed and reliability**

- Files are read one 4 MiB chunk at a time (`File.slice()`) and sent as 64 KiB binary frames.
  There's no Base64 and the whole file is never in memory.
- The sender respects `bufferedAmount`. The send buffer adapts from measured throughput and
  RTT, and receivers limit how many chunks may be unacknowledged.
- Every chunk is checked with SHA-256, and a final root digest is compared at the end. A
  corrupted chunk is re-sent automatically. A file is never reported complete unless it
  verified.
- Resume: progress is saved in IndexedDB. After a dropped connection or a reload, the
  transfer continues from the receiver's missing chunks instead of starting over.
- Stays under the backend's 20-transfer limit by creating transfers in groups.
- The connection recovers on its own: ICE restart, then a new connection, then a clear "Try
  again".

**Honest status**

- Progress, speed and time remaining come only from chunks the receiver has verified and
  stored.
- The connection label comes from WebRTC stats: **Direct connection** (local network),
  **Internet connection** (direct over the internet) or **Relay connection** (through TURN).
  It never claims "direct" without evidence.
- Quality (Excellent, Good, Weak) comes from the measured RTT.

**Experience**

- Mobile-first layout: one column on phones, two columns on desktop. Touch targets are at
  least 44 px and there's no horizontal scrolling from 320 px up.
- Light and dark themes with no flash on load, and a theme toggle.
- Subtle animations (devices joining, the QR code, drop zone, completion) that respect
  reduced-motion settings.
- Keyboard and screen-reader friendly: labelled controls, live regions, real buttons, and the
  drop zone also works without drag and drop.
- Sparing toast notifications: connected, received or sent, interrupted, failed.
- Friendly error states: room expired or ended, invalid code, device disconnected,
  unsupported browser, offline.
- Keeps the screen awake during transfers (where supported) and warns before closing a tab
  with an active transfer.

**Coming back: your devices and your room**

- **My devices:** pair your own devices once (a device's menu → *Add to My devices*). Later,
  *Connect my devices* on each puts them in the same room without a code, and files between
  them are accepted automatically. You can also queue files with *Send when my device
  connects*; they go out as soon as a paired device joins (keep the tab open).
- **Personal room link** (`/r/<key>`): a permanent link that always opens your room. Reset it
  any time; the old link stops working.
- **Nearby rooms (opt-in):** a host can make a room visible to devices on the same network,
  which see it on the home page and join with one tap.
- **Install as an app (PWA)** with *Share to Droply* in the phone's share sheet. Shared files
  and text are kept on the device by the service worker and open in a new room.
- **History** (`/history`) and **Stats & badges** (`/stats`): recent transfers, personal speed
  records, a monthly "Wrapped" summary and badges. All stored only on this device.
- Background notifications for incoming files, texts and pairing requests, and keyboard
  shortcuts (paste files or text, Ctrl+O, number keys pick recipients, `?` for help).

**Fun and social**

- Playful default device names with emoji avatars ("🦦 Sneaky Otter"), shuffled with one tap.
- Celebrations: confetti, synthesized sounds, haptics and a file "flight path" animation, with
  a toast that can share a result card. All optional, and off with reduced motion.
- Live speed: a big speed number, a 30-second graph, a speedometer for large files, total
  speed for the batch, speed per recipient, and an end summary ("2.8 GB in 35 s · average 79
  MB/s · top 112 MB/s").
- **Speed test** (`/speed-test`, or *Test speed* on any device): synthetic data over the real
  connection, verified and thrown away.
- **Text drop** and **room chat** over the encrypted DataChannel (the server never sees them),
  and **reactions** (👍 ❤️ 😂 🔥 🎉 🙏) on received files.
- **Room themes** (Party, Birthday, Wedding, Gaming, Study, Ocean, Sunset), picked when
  creating a room (the home page previews it) or later by the host. The whole room follows the
  theme for every device: colors, header, buttons, dialogs, background and confetti, with
  WCAG AA contrast in light and dark mode.
- **Event rooms** (up to 50 devices), a delivery roster for big audiences, a full-screen
  *Present* QR code and *Invite* through the share sheet.
- **Album** of received photos and videos, with previews only for files whose first bytes are
  a real raster image or video (never SVG or HTML).
- **Folders keep their structure** (sanitized paths), *Save all as .zip*, and *Send smaller
  photos* to resize before sending.
- **Security code:** four emoji derived from both DTLS fingerprints; compare them on both
  screens to confirm nobody is in the middle. *Reconnect through relay* forces TURN when a
  direct path keeps failing.
- A transparency page (`/privacy`) lists exactly what the server sees and never sees.

**Developer tools**

- A diagnostics panel (`NEXT_PUBLIC_DEBUG=true`) shows peer and connection ids, connection and
  ICE state, candidate types, DataChannel state, buffered amount, high-water mark, frame
  size, throughput and RTT.
- A benchmark page at `/dev/benchmark` (`NEXT_PUBLIC_ENABLE_BENCHMARK=true`) runs a synthetic
  loopback transfer through the real sender and receiver, with adjustable chunk size, frame
  size, buffer threshold, window and concurrency.

## Architecture

```text
  ┌──────────────────────────────────────────────────────┐
  │            Droply API  (FastAPI backend)             │
  │   rooms · devices · signaling · transfer state       │
  │   short-lived TURN credentials                       │
  └───────────▲──────────────────────────────▲───────────┘
              │ REST + WebSocket             │ REST + WebSocket
              │ (JSON, kilobytes)            │ (JSON, kilobytes)
  ┌───────────┴──────────┐        ┌──────────┴───────────┐
  │      Browser A       │        │      Browser B       │
  │       (sender)       │        │     (recipient)      │
  └───────────┬──────────┘        └──────────▲───────────┘
              │                              │
              └───── WebRTC DataChannel ─────┘
          file bytes: LAN → internet → TURN relay
```

Inside the frontend, React only renders. All networking and file handling lives in plain
TypeScript services owned by one `RoomSession` per room:

```text
┌────────────────────────── React (UI only) ──────────────────────────┐
│  app/ pages · components/ · hooks/ (useSyncExternalStore)           │
└─────────────▲───────────────────────────────────────────▲───────────┘
              │ snapshots (≤ 5 per second)                │ commands
┌─────────────┴────────── RoomSession (one per room) ─────┴───────────┐
│                                                                     │
│  SignalingClient    PeerManager → PeerLink     TransferManager      │
│  · WebSocket        · RTCPeerConnection        · state machine      │
│  · heartbeats       · DataChannel per peer     · scheduler          │
│  · backoff          · stats, recovery          · progress           │
│                                                                     │
│  FileSender / FileReceiver ── protocol ── storage sinks + worker    │
│  ApiClient (REST)              ResumeStore (IndexedDB)              │
└─────────────────────────────────────────────────────────────────────┘
```

`File` objects, buffers, peer connections and channels never enter React state.

## How a transfer works

```text
Sender A                        Droply API                       Recipient B
────────                        ──────────                       ───────────
POST /transfers (metadata) ───► transfer_request ──────────────► "Incoming files"
                                                                 user taps Accept
transfer_accepted ◄──────────── accept (REST) ◄───────────────── Accept
offer / answer / ICE ◄────────► relayed (WebSocket) ◄──────────► offer / answer / ICE

═══════════════════════════ WebRTC DataChannel (direct or TURN) ════════════════════════════
file_open ─────────────────────────────────────────────────────► open storage
◄─────────────────────────────────────────────────────────────── file_ready (chunks it has)
read chunk → SHA-256 → frames ─────────────────────────────────► verify → store
◄─────────────────────────────────────────────────────────────── chunk_ack (one credit back)
                                ◄─────────────────────────────── transfer_checkpoint (2 s)
file_end (root digest) ────────────────────────────────────────► verify root
                                ◄─────────────────────────────── complete (REST)
                                                                 "Open / Save"
```

Wire protocol on the DataChannel:

| Message                             | Direction  | Purpose                                           |
| ----------------------------------- | ---------- | ------------------------------------------------- |
| `hello`                             | both       | Protocol version and largest accepted frame       |
| `file_open`                         | → receiver | Start or restart a file in a slot                 |
| `file_ready {have, window}`         | → sender   | Chunks already stored and the credit window       |
| binary frame                        | → receiver | 16-byte header (slot, chunk, offset) + data       |
| `chunk_end {sha256}`                | → receiver | All frames of a chunk sent; its digest            |
| `chunk_ack` / `chunk_nack`          | → sender   | Chunk verified and stored / digest mismatch       |
| `file_end` / `file_done`            | both       | Root digest and the receiver's verdict            |
| `file_close {role, reason}`         | both       | Pause, cancel or error for one slot               |
| `bye`                               | both       | Intentional close (don't try to recover)          |

Where received data is stored, best option first:

1. **A folder you pick** (Chromium desktop): written in place, no second copy.
2. **OPFS** (Origin Private File System): written at offsets from a worker with
   synchronous access handles.
3. **IndexedDB**: one Blob per chunk, assembled into a file at the end.
4. **Memory**: only for files up to 256 MiB, as a last resort.

## Tech stack

| Area      | Choice                                                                      |
| --------- | --------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict)           |
| UI        | Tailwind CSS 4, shadcn/ui on Radix UI, Lucide icons, Framer Motion, Sonner  |
| Browser   | WebRTC, WebSocket, Web Crypto, OPFS, IndexedDB, File System Access          |
| Other     | `qrcode` (QR generation in the browser)                                     |
| Tests     | Vitest, Testing Library, jsdom, Playwright (installed Chrome)               |
| Tooling   | Bun, ESLint                                                                 |

## Getting started

Requirements: [Bun](https://bun.sh) 1.4+, Node.js 20+, Python 3.12+ for the backend, and a
current Chrome, Edge, Firefox or Safari.

1. Start the backend (in-memory mode, no Redis needed):

   ```bash
   cd ../Droply-BD/backend
   .venv/Scripts/activate          # macOS/Linux: source .venv/bin/activate
   uvicorn app.main:app --reload
   ```

2. Start the frontend:

   ```bash
   cp .env.example .env.local      # defaults point at http://localhost:8000
   bun install
   bun dev
   ```

3. Open http://localhost:3000, drop a file, then open the join link (or scan the QR code) in a
   second browser window or on another device.

## Configuration

Frontend (`.env.local`):

| Variable                           | Default (dev)                  | Notes                                            |
| ---------------------------------- | ------------------------------ | ------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`              | `http://localhost:8000/api/v1` | Required for production builds                   |
| `NEXT_PUBLIC_WS_URL`               | `ws://localhost:8000/ws/v1`    | Use `wss://` in production                       |
| `NEXT_PUBLIC_DEBUG`                | `false`                        | Diagnostics panel on the room page               |
| `NEXT_PUBLIC_ENABLE_BENCHMARK`     | `false`                        | Enables `/dev/benchmark`                         |
| `NEXT_PUBLIC_MAX_ACTIVE_TRANSFERS` | `16`                           | Open transfers per device (backend limit is 20)  |

`NEXT_PUBLIC_*` values are inlined at build time, so build once per environment.

Backend settings that must match the frontend (`../Droply-BD/backend/.env`):

| Variable              | Example                 | Why it matters                                      |
| --------------------- | ----------------------- | --------------------------------------------------- |
| `CORS_ORIGINS`        | `http://localhost:3000` | Browser requests and WebSocket origins allowed      |
| `PUBLIC_FRONTEND_URL` | `http://localhost:3000` | Builds the `join_url` that the QR code encodes      |
| `TURN_PROVIDER`       | `cloudflare`            | Relay for networks where a direct connection fails  |

Product name and taglines live in [config/brand.ts](config/brand.ts).

## Testing on a phone

Phones need **HTTPS for both the frontend and the backend**. `crypto.subtle`, OPFS and
`navigator.storage` only exist in secure contexts, and an HTTPS page can't open a `ws://`
socket.

1. Run `bun run dev:https` (Next.js creates a local certificate) and open it via your
   computer's LAN address, e.g. `https://192.168.1.20:3000`.
2. Serve the backend over TLS, for example
   `uvicorn app.main:app --host 0.0.0.0 --ssl-keyfile key.pem --ssl-certfile cert.pem`, or put it
   behind a local HTTPS proxy.
3. Point `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` at the LAN address, and add the frontend
   origin to the backend's `CORS_ORIGINS` and `PUBLIC_FRONTEND_URL`.

## Scripts

| Command                         | What it does                                                    |
| ------------------------------- | --------------------------------------------------------------- |
| `bun dev`                       | Development server                                              |
| `bun run dev:https`             | Development server over HTTPS (for phones)                      |
| `bun run build` / `bun start`   | Production build / production server                            |
| `bun run lint`                  | ESLint                                                          |
| `bun run typecheck`             | `tsc --noEmit`                                                  |
| `bun run test`                  | Unit, WebRTC, integration and component tests (Vitest)          |
| `bun run test:watch`            | Vitest in watch mode                                            |
| `bun run check-contract [url]`  | Runs the real API and signaling clients against a live backend  |
| `bunx playwright test`          | Browser end-to-end tests in the installed Chrome                |

## Testing

| Suite                                   | Kind                                      |
| --------------------------------------- | ----------------------------------------- |
| `tests/unit`                            | Pure logic                                |
| `tests/webrtc`                          | Signaling, negotiation, transfer pipeline |
| `tests/webrtc/transfer-manager.test.ts` | End-to-end transfer flows in Node         |
| `tests/webrtc/large-transfer.test.ts`   | Memory bound                              |
| `tests/components`                      | React components                          |
| `scripts/check-contract.ts`             | Live backend contract                     |
| `tests/e2e`                             | Real browser (Playwright)                 |

- **Unit:** ranges, the binary protocol, file-name sanitizing, formatting, backoff, device
  detection, the scheduler, the adaptive buffer, API client errors, message parsing, and all
  121 pairs of the transfer state machine.
- **WebRTC:** the signaling client (join first, pong, backoff, close codes, rate budget).
  Perfect negotiation against a fake `RTCPeerConnection` (glare, early candidates, peer
  restart). The send/receive pipeline (backpressure, credit window, corruption, resume,
  pause).
- **Transfer flows:** two or three real transfer managers against an in-memory backend.
  Covers multiple files and recipients, decline, the transfer limit, pause and resume, a
  dropped link with auto-resume, and cancel.
- **Memory:** 64 MiB and 512 MiB transfers keep live memory flat, at about 40–55 MiB.
- **Components:** drop zone, device card, transfer card, progress, room code, recipient
  selector, send panel.
- **Contract:** 37 checks against a running backend, including that the WebSocket schema
  matches our types exactly.
- **Browser:** real Chrome at desktop and phone sizes. Create, join, accept, a WebRTC
  transfer and a verified download; decline; invalid code; no horizontal scrolling.

Playwright needs the backend on `:8000` and the frontend on `:3000`. Set `E2E_BASE_URL` to
test another URL, and `E2E_BENCHMARK=1` (with `NEXT_PUBLIC_ENABLE_BENCHMARK=true`) to run the
throughput and memory benchmark.

## Project structure

```text
app/                    routes
├── page.tsx            /              home: drop zone, nearby rooms, my devices, join by code
├── join/[code]/        /join/CODE     join form (what the QR code opens)
├── room/[roomId]/      /room/ID       the transfer room
├── r/[key]/            /r/KEY         personal room link
├── my-devices/         /my-devices    paired devices and room link
├── history/, stats/    /history       local history; /stats: Wrapped and badges
├── speed-test/         /speed-test    device-to-device speed test
├── privacy/            /privacy       what the server sees
├── manifest.ts, icons/ PWA manifest (with share target) and generated icons
├── share-target/       fallback for shares before the service worker is installed
├── about/              /about
└── dev/benchmark/      /dev/benchmark (only when enabled)
components/
├── layout/             header, footer, theme, preferences, service worker registration
├── landing/            start sharing, join-by-code, nearby rooms, my devices, speed test
├── room/               room view, share panel, devices, chat, text drop, album, dialogs
├── transfer/           drop zone, send panel, transfer cards, speed graphics, media
├── history/            history and stats views
├── pairing/            my devices manager
├── dev/                diagnostics panel, benchmark
└── ui/                 shadcn/ui primitives (Radix + Tailwind)
config/                 brand.ts (product name), env.ts (validated settings)
hooks/                  React bindings to the services, device, countdown, wake lock
lib/
├── api/                typed REST client and endpoints
├── webrtc/             signaling, peer links, protocol, sender, receiver, transfer manager
├── storage/            IndexedDB, storage tiers (sinks), OPFS worker, saving files
├── session/            room session (owns all services), session store
├── device/             device detection and naming
├── fun/                names, celebrations, themes, preferences
├── history/            local history, records, badges, stats
├── pairing/            pairing and room-link keys
├── media/              magic-byte media sniffing, photo compression
├── share/, pwa/        result cards, share-target inbox, app icon
└── utils/              formatting, ranges, hashing, sanitizing, zip, local store
public/sw.js            service worker (share target only, no caching)
types/                  mirrors the backend's Pydantic models
tests/                  unit/, webrtc/, components/, e2e/, mocks/
scripts/                check-contract.ts
```

## Backend integration

REST endpoints used (base `/api/v1`):

| Endpoint                                       | Used for                                      |
| ---------------------------------------------- | --------------------------------------------- |
| `POST /rooms`                                  | Create a room (returns code, join URL, token) |
| `POST /rooms/join`                             | Join by code                                  |
| `GET /rooms/{id}`, `DELETE /rooms/{id}`        | Refresh expiry / host closes the room         |
| `DELETE /rooms/{id}/devices/{device_id}`       | Leave the room                                |
| `POST /transfers`, `GET /transfers/{id}`       | Create a transfer (metadata only) / its state |
| `POST /transfers/{id}/{action}`                | State changes (see below)                     |
| `POST /turn/credentials`                       | STUN plus short-lived TURN credentials        |
| `GET /config/transfer`                         | Chunk size and limits                         |

Transfer actions: `accept`, `reject`, `connect`, `start`, `pause`, `resume`, `complete`,
`fail`, `retry`, `cancel`, and `checkpoint` for resume ranges.

WebSocket `/ws/v1/rooms/{room_id}`: the device token is sent in the first `join` message (never
in the URL). After that the socket carries presence, relayed offer/answer/ICE, transfer
events, checkpoints and heartbeats. The client reconnects with backoff, and stops after close
codes that mean "don't retry" (4001, 4003, 4004, 4010, 4011, 4012). The full contract is in
the backend's `docs/WEBSOCKET_PROTOCOL.md`.

## Security and privacy

- WebRTC encrypts all file data in transit (DTLS), including relayed data. The server never
  receives file contents.
- The device token stays in `sessionStorage` and is never put in URLs or logs. Logs redact
  tokens, SDP and ICE candidates.
- File names, MIME types, device names and room codes are treated as untrusted.
  - Names are sanitized before saving: no paths, control or bidi characters, reserved Windows
    names, and at most 255 bytes.
  - Files are always saved as `application/octet-stream` and are never opened or previewed.
- Nothing is rendered as HTML. ESLint blocks `dangerouslySetInnerHTML`, `readAsDataURL` and
  `btoa`.
- Nobody can send you files without your approval (unless you turn on auto-accept for that
  device in that room).
- Rooms expire. Leaving revokes the device token.

## Browser support

Current Chrome, Edge, Firefox and Safari (including iOS 17+ and Android). The best storage tier
is chosen automatically, with fallbacks. If WebRTC isn't available, Droply shows a clear message
instead of failing. Transfers need a secure context (HTTPS or `localhost`).

## Status and limitations

Implemented and verified:

- lint, typecheck and production build are clean
- 261 Vitest tests
- the contract check against the real backend passes
- 14 Playwright tests in real Chrome (desktop and phone): transfers, decline, text drop,
  chat, speed test, pairing with auto-send, personal room links

See [implementation.md §10](implementation.md#10-implementation-status) for details.

- **Throughput on real devices hasn't been measured yet.** Use `/dev/benchmark` on your
  hardware to tune the defaults.
- **Low-memory phones:** chunk size, send buffer and parallel files shrink with the device's
  memory (`lib/device/memory.ts`); previews are small thumbnails decoded one at a time, and
  phones get no video thumbnails. After the file picker or camera, the connection is checked
  at once instead of waiting for heartbeats.
- **Phones** need the HTTPS setup above. Mobile browsers pause background tabs, so keep the
  tab open; transfers resume if it's interrupted.
- **Reloading the sender's page** requires selecting the same file again to resume. A
  reloaded receiver resumes on its own.
- **Folders** keep their structure: the sanitized relative path travels over the
  DataChannel (the backend still stores only file names). With normal downloads, browsers
  save into the Downloads folder, so use a picked folder or *Save all as .zip* for nested
  folders.
- **Not built from the ideas list:** translations, a browser extension and the encrypted
  "leave it for later" cloud copy.
- **Cloud fallback** (the backend's optional Cloudflare R2 upload when no P2P or TURN path
  works) is not implemented in the frontend yet.

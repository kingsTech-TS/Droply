# Build a Production-Ready Frontend for a High-Speed P2P File Transfer Platform

You are a senior frontend engineer specializing in **Next.js, TypeScript, WebRTC, high-performance browser networking, real-time applications, responsive UI/UX, accessibility, and large-file streaming**.

Build the frontend for a cross-platform web application that allows users to transfer:

- Documents
- Images
- Videos
- Audio
- ZIP files
- PDFs
- Presentations
- Spreadsheets
- Any arbitrary file type

between:

- Phones
- Tablets
- Laptops
- Desktop computers

The application should feel like a **web-based AirDrop / Quick Share**, but work across platforms through a browser.

The primary product promise is:

> **Send files quickly, directly, and effortlessly between devices.**

The frontend must be designed around the backend architecture where:

> **FastAPI handles rooms, signaling, devices, transfer metadata, security, and session orchestration.**

while:

> **WebRTC DataChannels handle the actual file data whenever possible.**

---

# 1. Technology Stack

Use:

- Next.js
- App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide React
- Framer Motion
- Web APIs
- WebRTC
- WebSocket
- Sonner for notifications

Do NOT use JavaScript.

Do NOT introduce unnecessary frontend libraries.

Use strict TypeScript.

---

# 2. Core Architecture

The frontend must follow:

```text
                    FRONTEND
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
   FastAPI Backend              WebRTC
        │                             │
        │ signaling                   │
        │ metadata                    │
        │ rooms                       │
        │ devices                     │
        │                             │
        └──────────────┐              │
                       │              │
                       ▼              ▼
                    Browser A ═════ Browser B
                              P2P
                           FILE DATA
```

The frontend MUST NOT upload large P2P files to FastAPI.

For a 10 GB file:

```text
Browser A
    │
    │ WebRTC DataChannel
    ▼
Browser B
```

The FastAPI server should only coordinate the connection.

---

# 3. Product Name

The product name is:

**Droply**

It matches the backend (`Droply API`). Keep all branding (name, taglines, logo) in one config
file, `config/brand.ts`, so it can be changed later.

Core tagline:

> **Send anything. Instantly.**

Secondary tagline:

> **Fast, private file sharing between your devices.**

---

# 4. Main User Experience

The homepage should immediately communicate what the application does.

The user should see something similar to:

```text
┌──────────────────────────────────────────────────┐
│                                                  │
│                    ⚡ Droply                     │
│                                                  │
│            Send anything. Instantly.             │
│                                                  │
│     Transfer files directly between your devices │
│                                                  │
│                                                  │
│       ┌──────────────────────────────────┐       │
│       │                                  │       │
│       │       Drop files here            │       │
│       │                                  │       │
│       │             or                   │       │
│       │                                  │       │
│       │        [ Select Files ]          │       │
│       │                                  │       │
│       │    Documents • Videos • Images   │       │
│       │       Audio • ZIP • Anything     │       │
│       │                                  │       │
│       └──────────────────────────────────┘       │
│                                                  │
│                  ─── OR ───                      │
│                                                  │
│             Join with a room code               │
│                                                  │
│             [ K7X9PQ  ] [ Join ]                │
│                                                  │
└──────────────────────────────────────────────────┘
```

Keep the experience extremely simple.

---

# 5. Homepage

Create:

```text
/
```

The homepage should contain:

### Header

Logo:

```text
⚡ Droply
```

Navigation:

```text
How it works
About
```

Optional:

```text
Theme toggle
```

Do not clutter the header with unnecessary navigation.

---

# 6. Create Room Flow

When the user selects files or chooses to start sharing:

Create a room through:

```http
POST /api/v1/rooms
```

Request body (the creator becomes the room's host device):

```json
{
  "device": {
    "device_name": "Solomon's Laptop",
    "device_type": "laptop",
    "browser": "Chrome",
    "operating_system": "Windows"
  }
}
```

The response is a `RoomSession`:

```json
{
  "room_id": "rm_...",
  "room_code": "K7X9PQ",
  "join_url": "https://droply.app/join/K7X9PQ",
  "expires_at": "...",
  "device": { "device_id": "dv_...", "device_name": "Solomon's Laptop", "is_host": true },
  "device_token": "...",
  "token_expires_at": "...",
  "room": { "room_id": "rm_...", "devices": [] },
  "ice_servers": [{ "urls": ["stun:stun.l.google.com:19302"] }],
  "transfer_config": { "recommended_chunk_size": 4194304 }
}
```

`device_token` is private. Keep it in `sessionStorage` (never in URLs or logs) and send it as
`Authorization: Bearer <token>` on REST calls and in the WebSocket `join` message.

`expires_at` is a sliding window: the server extends it while devices are active, up to the
room's `max_expires_at`.

Display:

```text
Your room is ready

K7X9PQ

[Copy Code]

or

[QR CODE]

Scan this QR code
with another device.
```

Animate the QR code and connection state subtly.

---

# 7. QR Code

Generate the QR code on the frontend.

Do not ask the backend to generate and store QR images.

The QR code should encode `join_url` exactly as the backend returns it. The backend builds it
from its `PUBLIC_FRONTEND_URL` setting.

Example:

```text
https://droply.app/join/K7X9PQ
```

When a phone scans it:

```text
Phone
 ↓
Browser
 ↓
Droply
 ↓
Automatically opens join flow
```

---

# 8. Join Room

Create:

```text
/join/[code]
```

Support:

```text
/join/K7X9PQ
```

Display:

```text
Join Droply

Room:
K7X9PQ

Your device name:

[ Solomon's iPhone ]

[ Join Room ]
```

Automatically detect:

- Phone
- Tablet
- Laptop
- Desktop

using browser/device information.

Allow the user to edit their device name (at most 64 characters).

Join through:

```http
POST /api/v1/rooms/join
```

with:

```json
{ "room_code": "K7X9PQ", "device": { "device_name": "Solomon's iPhone", "device_type": "phone" } }
```

The response is the same `RoomSession` as room creation.

Room codes are **6 characters** from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no O/0/I/1/L).
The backend accepts them case-insensitively and ignores dashes and spaces.

---

# 9. Device Detection

Create a utility:

```typescript
detectDevice()
```

Return:

```typescript
type DeviceType =
  | "phone"
  | "tablet"
  | "laptop"
  | "desktop"
  | "unknown";
```

Also detect:

```text
browser
operating system
```

Do not rely on this for security.

It is only for UI/device identification.

---

# 10. Room Dashboard

After joining a room:

```text
/room/[roomId]
```

Create the main transfer interface.

Example:

```text
┌─────────────────────────────────────────────────────┐
│ ⚡ Droply                            Room K7X9PQ      │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Connected Devices                                   │
│                                                     │
│ 💻 Solomon's Laptop       ● Connected              │
│ 📱 John's iPhone          ● Connected              │
│ 📱 Mary's Samsung         ● Connected              │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│              Drop files here                        │
│                                                     │
│                or                                   │
│                                                     │
│             [ Select Files ]                        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

# 11. Device Cards

Each connected device should have a beautiful card.

Example:

```text
┌───────────────────────────────┐
│ 💻                            │
│ Solomon's Laptop              │
│ Windows • Chrome              │
│                               │
│ ● Connected                   │
│                               │
│ [ Send Files ]                │
└───────────────────────────────┘
```

Use icons appropriate to:

- Phone
- Tablet
- Laptop
- Desktop

Use subtle animations when devices connect/disconnect.

---

# 12. WebSocket Connection

Create a reusable WebSocket manager.

Example:

```text
lib/webrtc/signaling-client.ts
```

Connect to:

```text
/ws/v1/rooms/{room_id}
```

The URL carries no token. The **first message must be `join`**, sent within 5 seconds:

```json
{ "type": "join", "token": "<device_token>", "device": { "device_name": "Solomon's Laptop" } }
```

The server replies with `room_state`: the room, `self_device_id`, `peers` (each with a
`polite` flag for perfect negotiation), STUN `ice_servers`, `transfer_config` and
`heartbeat_seconds`.

Client → server messages:

```text
join  leave  ping  pong

offer  answer  ice_candidate  connection_state

transfer_request
transfer_accepted  transfer_rejected
transfer_connecting  transfer_started
transfer_paused  transfer_resumed
transfer_completed  transfer_failed  transfer_retrying  transfer_cancelled
transfer_checkpoint
```

Server → client events:

```text
room_state  peer_joined  peer_updated  peer_left

offer  answer  ice_candidate  connection_state   (relayed, with sender_id)

transfer_request  transfer_created
transfer_accepted  transfer_rejected
transfer_connecting  transfer_started
transfer_paused  transfer_resumed
transfer_completed  transfer_failed  transfer_retrying
transfer_cancelled  transfer_expired
transfer_checkpoint  transfer_fallback_ready

ping  pong  error  room_closed  room_expired
```

Reply `pong` to every server `ping`. Frames are JSON text only, at most 64 KiB each, and
limited to 200 messages per 10 seconds per device.

The backend's `docs/WEBSOCKET_PROTOCOL.md` is the full contract, including close codes.
`GET /api/v1/ws-schema` returns a JSON Schema for every message.

Use strongly typed TypeScript message definitions.

Do not use:

```typescript
any
```

for WebSocket messages.

---

# 13. WebRTC Architecture

Create a dedicated WebRTC layer.

Suggested:

```text
lib/webrtc/
├── peer-connection.ts
├── data-channel.ts
├── signaling-client.ts
├── file-sender.ts
├── file-receiver.ts
├── transfer-manager.ts
├── chunk-manager.ts
├── resume-manager.ts
└── types.ts
```

Do not place WebRTC logic directly inside React components.

React components should consume hooks/services.

---

# 14. Peer Connections

For every remote device:

```text
device_id
   ↓
RTCPeerConnection
   ↓
RTCDataChannel
```

Maintain a map:

```typescript
Map<string, RTCPeerConnection>
```

and:

```typescript
Map<string, RTCDataChannel>
```

Clean them up when devices leave.

---

# 15. STUN/TURN

Fetch or configure ICE servers from the backend.

Use:

```http
POST /api/v1/turn/credentials
```

(authenticated) when appropriate. Merge the returned `ice_servers` with the STUN servers from
`room_state`. Cache them until shortly before `expires_at`. If the call fails with
`TURN_UNAVAILABLE`, continue with STUN only.

Build the WebRTC configuration dynamically.

Example:

```typescript
const configuration: RTCConfiguration = {
  iceServers,
};
```

Do not hard-code TURN passwords in frontend source code.

Do not expose permanent TURN credentials.

---

# 16. WebRTC Connection Strategy

Prioritize:

```text
1. Direct LAN P2P
2. Direct Internet P2P
3. TURN relay
```

The frontend should expose the connection state.

For example:

```text
⚡ Direct connection
```

or:

```text
🌐 Internet connection
```

or:

```text
🔄 Relay connection
```

Do not claim a connection is direct unless the WebRTC statistics/state actually support that conclusion.

---

# 17. File Selection

Support:

```text
<input type="file" multiple />
```

Allow:

- Multiple files
- Drag and drop
- Folder selection where browser support permits
- Very large files

Do not load selected files into memory.

Keep the original:

```typescript
File
```

object.

---

# 18. Drag and Drop

Create a polished drop zone.

When dragging:

```text
Drop files to send
```

Animate the border and background.

When files are dropped:

```text
5 files selected
```

Then display a confirmation/recipient step.

---

# 19. File Queue

Create a transfer queue.

Example:

```text
Files ready to send

┌───────────────────────────────────────────┐
│ 🎥 campus-event.mp4             2.8 GB   │
│                                           │
│ 📄 report.pdf                    4 MB    │
│                                           │
│ 🖼️ photos.zip                   780 MB   │
└───────────────────────────────────────────┘

Send to:

☑ John's iPhone
☐ Mary's Samsung

             [ Send Files ]
```

Allow users to remove individual files.

---

# 20. Recipient Selection

Before starting the transfer:

```text
Send to

☑ Solomon's Laptop
☐ John's iPhone
☐ Mary's Samsung
```

Support:

```text
Select all
Clear all
```

If only one device exists, automatically select it.

---

# 21. Transfer Request

Before sending, create a transfer through:

```http
POST /api/v1/transfers
```

Send metadata only.

**One transfer is one file.** It can have several recipients, and each recipient is an
independent "leg" with its own state.

Example:

```json
{
  "recipient_ids": ["dv_9c1hZx0Qm3LkT2pWq8sYbA"],
  "file": {
    "file_name": "video.mp4",
    "file_size": 5368709120,
    "mime_type": "video/mp4",
    "chunk_size": 4194304,
    "total_chunks": 1280
  }
}
```

`total_chunks` must equal `ceil(file_size / chunk_size)`. Leave `sha256` (a full-file digest)
out unless it was actually computed.

Selecting 5 files creates **5 transfers** with the same recipients. Group them on the client
under a local batch id so the UI shows one queue and one "Incoming files" card.

Do NOT upload the file.

---

# 22. Recipient Approval

The recipient should receive a beautiful notification:

```text
┌────────────────────────────────────┐
│ Incoming files                     │
│                                    │
│ Solomon wants to send you          │
│                                    │
│ 🎥 campus-event.mp4                │
│ 📄 report.pdf                      │
│ 🖼️ photos.zip                      │
│                                    │
│ Total: 3.5 GB                      │
│                                    │
│ [ Decline ]        [ Accept ]      │
└────────────────────────────────────┘
```

The recipient must explicitly accept unless an optional trusted-device mode is enabled.

The backend always requires acceptance, so trusted-device mode lives on the client: the
recipient chooses "Auto-accept from this device for this room", and its client sends `accept`
automatically. Nothing is remembered across rooms.

Group `transfer_request` events from the same sender that arrive within about 400 ms into one
card.

---

# 23. File Chunking

This is one of the most important parts of the application.

Do NOT send huge files as one WebRTC message.

Split files into chunks.

Initial default:

```text
4 MB
```

Make it configurable. Use `transfer_config.recommended_chunk_size` from the backend as the
default, within its `min_chunk_size` / `max_chunk_size`.

A **chunk** is the unit of resume, hashing and storage. It is **not** one DataChannel message.
Browsers limit message size (about 256 KiB in Chrome, and less in some Safari versions; read
`pc.sctp.maxMessageSize`). Send each chunk as a series of binary **frames**: 64 KiB by default,
or 16 KiB when `maxMessageSize` is unknown.

Example:

```typescript
const chunk = file.slice(start, end);
```

Do not convert chunks to Base64.

Send binary data directly.

---

# 24. Backpressure

The file sender MUST respect:

```typescript
RTCDataChannel.bufferedAmount
```

Never continuously call:

```typescript
channel.send(...)
```

without checking the buffer.

Implement a send loop similar to:

```text
while bufferedAmount < threshold:
    read next chunk
    send chunk
```

Use:

```text
bufferedAmountLowThreshold
```

and:

```text
bufferedamountlow
```

to continue sending.

This is critical for large-file performance.

The receiver also needs backpressure. A DataChannel cannot slow the sender down, so if the
receiver's disk is slower than the network, data piles up in its memory. The receiver must
acknowledge each chunk once it is verified and written. The sender keeps at most a few
unacknowledged chunks per recipient (for example 6 on desktop and 3 on mobile).

---

# 25. Adaptive Transfer

Implement a transfer controller that monitors:

```text
bufferedAmount
RTT
connection state
estimated throughput
```

Use these metrics to tune:

```text
chunk size
send window
```

Do not aggressively increase buffers without measurements.

Prevent browser memory exhaustion.

---

# 26. Binary Protocol

Define a small binary transfer protocol.

Every chunk should contain enough information for the receiver to identify:

```text
transfer_id
file_id
chunk_index
total_chunks
payload
```

Do not send huge JSON messages around the actual binary payload.

Use compact metadata followed by binary data where practical.

Send per-file metadata once, in a small JSON control message when the file is opened. Each
binary frame then carries only a fixed header (a short slot number for the file, the chunk
index, the offset in the chunk and the payload length) followed by the payload.

---

# 27. File IDs

Every selected file gets a unique ID:

```text
file_id
```

Example:

```typescript
interface TransferFile {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
}
```

This is necessary when sending multiple files simultaneously.

Because one backend transfer is one file, use the backend's `transfer_id` as the `fileId`.
Use the backend field names (`file_name`, `file_size`, `mime_type`, `chunk_size`,
`total_chunks`) in API types.

---

# 28. Transfer Progress

Display:

```text
Sending

campus-event.mp4

████████████████░░░░ 82%

2.30 GB / 2.80 GB

Speed
87.4 MB/s

Average
79.2 MB/s

Remaining
6 seconds
```

Calculate:

```text
current speed
average speed
bytes transferred
percentage
ETA
```

Do not update React state on every individual byte/chunk.

Throttle UI updates to approximately:

```text
100–250ms
```

to prevent unnecessary rendering.

---

# 29. Transfer Speed Calculation

Calculate:

```text
bytesTransferred / elapsedTime
```

Display human-readable units:

```text
KB/s
MB/s
GB/s
```

Use binary units consistently if desired:

```text
MiB/s
GiB/s
```

or decimal:

```text
MB/s
GB/s
```

Pick one convention and use it everywhere.

---

# 30. Multiple Files

Allow multiple files to transfer in the same session.

Prefer controlled concurrency.

Do NOT simply start 20 huge files simultaneously.

Implement a transfer scheduler.

For example:

```text
File 1 ──────────────►
File 2 ──────────────►

File 3 waiting
File 4 waiting
```

For multiple recipients:

```text
Laptop ───► Phone
        └──► Tablet
        └──► Desktop
```

Manage each peer independently.

The backend allows at most 20 unfinished transfers per device (`TRANSFER_LIMIT_REACHED`).
Create server transfers in groups, keeping a margin below that limit, and keep the remaining
files queued on the client.

---

# 31. Resume Support

This is essential.

If a transfer stops at:

```text
7.8 GB / 8 GB
```

do not restart from zero.

Store resumable transfer information locally using an appropriate browser storage mechanism.

Use:

```text
IndexedDB
```

for large transfer metadata/state where persistence is useful.

Do NOT store the entire multi-gigabyte file in IndexedDB by default.

Track:

```text
transfer_id
file_id
last confirmed chunk
received chunks
file metadata
```

When reconnecting:

```text
Resume transfer?
```

Then continue from the appropriate chunk.

While receiving, the recipient sends `transfer_checkpoint` every few seconds with the inclusive
chunk ranges it has verified, for example `[[0, 511], [520, 600]]` (at most 1024 ranges). After
a reconnect, the sender reads `recipients[].received_ranges` and sends only the gaps.

If the sender's page reloads, its `File` object is gone. Ask the user to select the same file
again, and check name, size, `lastModified` and the first chunk's hash before resuming.

---

# 32. Receiver

The receiver must:

1. Accept transfer.
2. Create transfer state.
3. Receive chunks.
4. Validate metadata.
5. Track chunk indexes.
6. Store chunks efficiently.
7. Reconstruct the file.
8. Verify integrity.
9. Trigger download/save.
10. Clean temporary state.

Do not concatenate enormous arrays in memory like:

```typescript
chunks.push(...)
new Blob(chunks)
```

for extremely large files without considering memory constraints.

Design the receiver around browser capabilities and persistent temporary storage.

Prefer streaming-oriented browser APIs where available.

Provide a robust fallback for browsers that do not support the preferred API.

Use this order:

1. **Direct to disk** (Chromium): `showSaveFilePicker()` in the Accept click handler, then
   write each chunk at its offset.
2. **OPFS** (Origin Private File System): write chunks at their offsets from a worker using
   `createSyncAccessHandle()`. Save the finished file when the user taps Save.
3. **IndexedDB**: one Blob per chunk, assembled into a Blob when the file is complete.
4. **Memory**: only as a last resort, and only for small files.

Before accepting, compare `navigator.storage.estimate()` with the total size and request
`navigator.storage.persist()`.

---

# 33. File Integrity

Support file integrity verification.

Web Crypto cannot hash a stream, and hashing a 10 GB file before sending means reading it
twice. Instead:

- The sender computes SHA-256 for each chunk and sends the digest after the chunk's frames.
- The receiver checks each chunk's digest before writing and acknowledging it. Only verified
  chunks count towards progress and checkpoints.
- At the end, both sides compute SHA-256 over the list of chunk digests and compare. Only then
  does the recipient report `transfer_completed`.

Display:

```text
✓ Transfer complete
✓ File verified
```

If verification fails:

```text
⚠ File verification failed
```

Do not silently mark a corrupted transfer as successful.

---

# 34. Transfer States

Use a strict state machine.

Client-only states, before the server knows about the transfer:

```text
queued
requesting
```

After that, mirror the backend's state for each recipient leg:

```text
pending        (show as "Waiting for acceptance")
accepted
rejected
connecting
transferring
paused
completed
failed
retrying
cancelled
expired
```

Allowed transitions (from the backend's `transfer_state.py`):

```text
pending      → accepted | rejected | cancelled | expired
accepted     → connecting | cancelled | expired
connecting   → transferring | failed | cancelled | expired
transferring → paused | completed | failed | cancelled | expired
paused       → transferring | failed | cancelled | expired
failed       → retrying | cancelled | expired
retrying     → connecting | transferring | failed | cancelled | expired
```

`rejected`, `completed`, `cancelled` and `expired` are final. When a server event disagrees with
the local state, the server wins.

Do not allow invalid state transitions.

Create a centralized transfer manager.

---

# 35. Pause

User should be able to:

```text
[ Pause ]
```

Transfer changes to:

```text
Paused

1.8 GB / 4 GB

[ Resume ]
```

Pause should stop sending new chunks but preserve state.

---

# 36. Cancel

Allow:

```text
[ Cancel ]
```

Ask for confirmation for active large transfers:

```text
Cancel this transfer?

The transfer can no longer be resumed.

[ Keep Transfer ] [ Cancel ]
```

---

# 37. Notifications

Use Sonner.

Examples:

```text
✓ Connected to John's iPhone

✓ Transfer completed

⚠ Connection interrupted

↻ Resuming transfer

✕ Transfer failed
```

Do not overuse notifications.

---

# 38. Connection Quality

Display useful information:

```text
⚡ Excellent
```

```text
● Good
```

```text
△ Weak
```

Base this on actual connection statistics where possible.

Do not invent network speeds.

---

# 39. Transfer Statistics

Create an optional expanded view:

```text
Transfer details

Connection
Direct P2P

Current speed
87.4 MB/s

Average speed
79.2 MB/s

Latency
12 ms

Data transferred
3.2 GB

Estimated remaining
8 sec
```

Use WebRTC statistics:

```typescript
RTCPeerConnection.getStats()
```

where appropriate.

Do not poll stats excessively.

---

# 40. Mobile UX

The application must be mobile-first.

On phones:

```text
┌───────────────────────────┐
│ ⚡ Droply                 │
│                           │
│ 2 devices connected       │
│                           │
│ ┌───────────────────────┐ │
│ │                       │ │
│ │   Drop files here     │ │
│ │                       │ │
│ │   [ Select Files ]    │ │
│ │                       │ │
│ └───────────────────────┘ │
│                           │
│ Connected devices         │
│                           │
│ 📱 John's iPhone          │
│ ● Connected               │
│                           │
└───────────────────────────┘
```

Buttons must be touch-friendly.

Do not rely on hover.

---

# 41. Desktop UX

On desktop, use the available screen space.

Example:

```text
┌───────────────────────────────────────────────────┐
│ ⚡ Droply                      Room K7X9PQ         │
├──────────────────────┬────────────────────────────┤
│                      │                            │
│ Connected Devices    │      Drop files here       │
│                      │                            │
│ 💻 Laptop            │            ↓               │
│ 📱 iPhone            │     [ Select Files ]       │
│ 📱 Samsung            │                            │
│                      │                            │
├──────────────────────┴────────────────────────────┤
│ Active Transfers                                   │
│                                                    │
│ video.mp4   ███████████████░░ 82%   87 MB/s       │
└────────────────────────────────────────────────────┘
```

---

# 42. Responsive Design

Support:

```text
320px+
375px+
768px+
1024px+
1280px+
1440px+
```

No horizontal scrolling.

Test:

- iPhone-sized viewport
- Android viewport
- iPad
- Laptop
- Desktop

---

# 43. Animations

Use Framer Motion sparingly.

Animate:

- Device appearing
- Device disconnecting
- Room creation
- File drop
- Transfer progress
- Completion
- Connection status

Do NOT animate every progress update.

Animations must not interfere with performance.

---

# 44. Accessibility

Support:

- Keyboard navigation
- Focus states
- Screen readers
- ARIA labels
- Proper buttons
- Reduced motion
- Color contrast

Do not communicate state using color alone.

For example:

```text
● Connected
```

should also include accessible text.

---

# 45. Error States

Create polished states for:

### Room expired

```text
This room has expired.

Create a new room to continue.

[ Create New Room ]
```

### Device disconnected

```text
John's iPhone disconnected.

[ Retry ]
```

### WebRTC failure

```text
Direct connection failed.

Trying another connection method...
```

### Transfer failure

```text
Transfer interrupted.

1.8 GB of 4 GB transferred.

[ Resume ]
```

---

# 46. Offline/Network Changes

Listen for:

```text
online
offline
```

events.

When connectivity changes:

```text
Connection interrupted
```

Do not immediately destroy transfer state.

Attempt reconnection when appropriate.

---

# 47. Browser Compatibility

Gracefully handle browsers where required WebRTC APIs are unavailable.

If WebRTC is unavailable:

```text
Your browser does not support direct transfers.

Try Chrome, Edge, Firefox, or Safari with a supported version.
```

Do not crash the application.

---

# 48. Security

Never trust:

- File names
- MIME types
- Room codes
- Device names
- Transfer metadata

Sanitize file names before creating downloads.

Never inject file names directly into HTML.

Do not execute received files.

Treat all transferred files as untrusted user content.

---

# 49. No Base64

This is a strict requirement.

Do NOT implement:

```typescript
FileReader.readAsDataURL()
```

for actual file transfer.

Do NOT send:

```text
Base64
```

through WebRTC.

Use binary data.

---

# 50. No Full-File ArrayBuffer

Do not do:

```typescript
const buffer = await file.arrayBuffer();
```

for multi-gigabyte files.

Use:

```typescript
file.slice(start, end)
```

and stream/chunk progressively.

---

# 51. Performance Rules

Never:

- Load a 10 GB file completely into memory.
- Base64 encode files.
- Upload P2P files to FastAPI.
- Render thousands of progress updates per second.
- Create unnecessary copies of binary data.
- Store entire files in React state.
- Store large binary payloads in Redux/Zustand.
- Send unlimited WebRTC messages without backpressure.

Always:

- Use File slices.
- Use binary DataChannel messages.
- Respect `bufferedAmount`.
- Throttle UI updates.
- Keep file data outside React state.
- Clean up WebRTC resources.
- Use IndexedDB only where appropriate.
- Measure connection performance.

---

# 52. State Management

Do not put huge file objects or binary chunks into global application state.

Use React state for:

```text
UI state
connection status
selected devices
transfer metadata
progress
```

Keep:

```text
File objects
ArrayBuffers
RTCDataChannels
RTCPeerConnections
```

inside dedicated managers/refs/services.

Use Context or a lightweight state manager only if necessary.

---

# 53. Suggested Frontend Structure

Create:

```text
app/
├── page.tsx
├── join/
│   └── [code]/
│       └── page.tsx
├── room/
│   └── [roomId]/
│       └── page.tsx
└── layout.tsx

components/
├── layout/
│   ├── header.tsx
│   └── footer.tsx
│
├── room/
│   ├── room-header.tsx
│   ├── device-list.tsx
│   ├── device-card.tsx
│   ├── room-code.tsx
│   └── qr-code.tsx
│
├── transfer/
│   ├── drop-zone.tsx
│   ├── file-list.tsx
│   ├── file-item.tsx
│   ├── recipient-selector.tsx
│   ├── incoming-transfer.tsx
│   ├── transfer-card.tsx
│   ├── transfer-list.tsx
│   ├── transfer-progress.tsx
│   └── transfer-details.tsx
│
└── ui/

lib/
├── api/
│   ├── client.ts
│   ├── rooms.ts
│   ├── devices.ts
│   └── transfers.ts
│
├── webrtc/
│   ├── peer-connection.ts
│   ├── data-channel.ts
│   ├── signaling-client.ts
│   ├── file-sender.ts
│   ├── file-receiver.ts
│   ├── transfer-manager.ts
│   ├── chunk-manager.ts
│   ├── resume-manager.ts
│   └── types.ts
│
├── device/
│   └── detection.ts
│
├── storage/
│   └── indexed-db.ts
│
└── utils/

hooks/
├── use-room.ts
├── use-signaling.ts
├── use-webrtc.ts
├── use-transfer.ts
├── use-device.ts
└── use-network-status.ts

types/
├── room.ts
├── device.ts
├── transfer.ts
└── signaling.ts
```

Adjust the structure if a better architecture is appropriate.

---

# 54. API Client

Create a typed API client.

Base URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/v1
```

Production example:

```env
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
NEXT_PUBLIC_WS_URL=wss://api.example.com/ws/v1
```

Never hard-code production URLs.

Testing on a phone needs HTTPS for **both** the frontend and the backend. `crypto.subtle`, OPFS
and `navigator.storage` only work in secure contexts, and `http://192.168.x.x` is not one. An
HTTPS page also cannot open a plain `ws://` socket. Use `next dev --experimental-https` (or
mkcert), serve the backend over TLS, and point both URLs at the LAN address.

---

# 55. API Client Requirements

Implement:

```typescript
createRoom()          // POST   /rooms
joinRoom()            // POST   /rooms/join
getRoom()             // GET    /rooms/{room_id}
closeRoom()           // DELETE /rooms/{room_id}  (host only)
getDevices()          // GET    /rooms/{room_id}/devices
leaveRoom()           // DELETE /rooms/{room_id}/devices/{device_id}

createTransfer()      // POST   /transfers
getTransfer()         // GET    /transfers/{transfer_id}
acceptTransfer()      // POST   /transfers/{transfer_id}/accept
rejectTransfer()      // POST   /transfers/{transfer_id}/reject
connectTransfer()     // POST   /transfers/{transfer_id}/connect
startTransfer()       // POST   /transfers/{transfer_id}/start
pauseTransfer()       // POST   /transfers/{transfer_id}/pause
resumeTransfer()      // POST   /transfers/{transfer_id}/resume
completeTransfer()    // POST   /transfers/{transfer_id}/complete
failTransfer()        // POST   /transfers/{transfer_id}/fail
retryTransfer()       // POST   /transfers/{transfer_id}/retry
cancelTransfer()      // POST   /transfers/{transfer_id}/cancel
checkpointTransfer()  // POST   /transfers/{transfer_id}/checkpoint

getTurnCredentials()  // POST   /turn/credentials
getTransferConfig()   // GET    /config/transfer
```

Action endpoints accept an optional `{ "device_id", "reason" }` body. The sender uses
`device_id` to act on one recipient leg. Every action returns the full `TransferView`; replace
the local copy with it.

Use strongly typed request/response models.

Handle:

```text
401
403
404
409
429
500
```

appropriately.

Every error uses the same envelope:

```json
{ "success": false, "error": { "code": "ROOM_EXPIRED", "message": "...", "request_id": "rq_..." } }
```

Handle errors by `error.code` (`ROOM_EXPIRED`, `INVALID_ROOM_CODE`, `ROOM_FULL`,
`TRANSFER_LIMIT_REACHED`, `INVALID_STATE`, `RATE_LIMITED`, `TURN_UNAVAILABLE`, ...), not only by
HTTP status. On 429, respect the `Retry-After` header.

---

# 56. WebSocket Reconnection

Implement controlled reconnection.

Use:

```text
exponential backoff
```

with reasonable limits.

Example:

```text
1 sec
2 sec
4 sec
8 sec
16 sec
```

Do not reconnect infinitely at maximum speed.

Reset the backoff after successful connection.

Do not reconnect automatically after close codes `4001` (not authenticated), `4003`
(forbidden), `4004` (room not found), `4010` (room ended), `4011` (replaced by another tab)
or `4012` (removed by host).

---

# 57. Browser Lifecycle

Handle:

```text
page visibility
tab backgrounding
browser suspension
device sleep
network changes
```

as gracefully as possible.

Do not assume WebRTC remains active indefinitely when mobile browsers suspend the page.

Persist enough metadata to recover when possible.

---

# 58. Transfer Completion

When a transfer completes:

```text
✓ Transfer complete

campus-event.mp4
2.8 GB
79.4 MB/s average

[ Open / Save ]
```

Use the browser's normal download mechanism.

Do not silently navigate away from the room.

---

# 59. Download Handling

For smaller files, Blob download may be acceptable.

For very large files, prefer streaming/file-system APIs where browser support allows.

Implement progressive enhancement:

```text
Preferred:
File System Access API / streaming

Fallback:
Blob/object URL
```

Never assume the File System Access API exists.

---

# 60. Storage Management

If temporary browser storage is used:

Show:

```text
Temporary transfer data

1.4 GB

[ Clear temporary data ]
```

Clean temporary data after successful completion unless needed for resume/history.

---

# 61. Theme

Create a polished modern interface.

Default:

**Dark + light adaptive theme**

Suggested visual direction:

```text
Background:
neutral/slate

Primary:
violet/indigo

Accent:
electric blue

Success:
green

Warning:
amber
```

Do not overuse gradients.

The interface should feel:

- Fast
- Modern
- Technical
- Premium
- Trustworthy
- Minimal

---

# 62. Visual Identity

Logo:

```text
⚡
Droply
```

Use a subtle lightning/transfer visual concept.

The UI should visually communicate:

```text
speed
connection
simplicity
```

Avoid making it look like a generic cloud-storage application.

This is primarily a **device-to-device transfer tool**.

---

# 63. Landing Page

Add a small section explaining the technology:

```text
Built for speed

⚡ Direct transfers
Files move directly between compatible devices.

🔒 Private
Your files don't need to pass through our servers.

📱 Cross-platform
Phone, tablet, laptop, desktop.

🚀 Built for large files
Designed for videos, archives, projects and more.
```

Avoid making absolute privacy/security claims that the technical implementation cannot guarantee.

---

# 64. How It Works

Create a simple three-step section:

```text
01
Create a room

02
Connect your device

03
Send files directly
```

Use illustrations/icons.

---

# 65. Room Expiration

Show:

```text
Room expires in

08:42
```

Use a countdown.

When it expires:

```text
Room expired
```

Disconnect WebSocket connections cleanly.

---

# 66. Device Connection Animation

When a device joins:

```text
Connecting...

    💻  ──────────  📱

Connected ✓
```

Use a subtle animation.

Do not make animations excessive.

---

# 67. Transfer Visualization

For active transfers, show:

```text
                    82%

             ████████████░░░

             2.3 GB / 2.8 GB

          ⚡ 87.4 MB/s

            ~6 seconds
```

For multiple transfers:

```text
Transfers

Video.mp4
████████████████░░ 82%
87 MB/s

Photos.zip
████████░░░░░░░░░░ 43%
31 MB/s
```

---

# 68. Accessibility for File Selection

The drop zone must still work with keyboard and screen readers.

Provide:

```text
Select files
```

as a normal button.

Do not make the entire application dependent on drag-and-drop.

---

# 69. Error Recovery UX

If WebRTC direct connection fails:

```text
Direct connection unavailable.

Trying another route...
```

Then:

```text
Connected through relay.
```

If all routes fail:

```text
We couldn't establish a direct connection.

Try reconnecting or use temporary link transfer.
```

Do not expose technical WebRTC errors to normal users.

Keep detailed errors in development logs.

---

# 70. Developer Mode

Create a development diagnostics panel that can be enabled through:

```env
NEXT_PUBLIC_DEBUG=true
```

Show:

```text
Peer ID
Connection state
ICE connection state
ICE candidate type
DataChannel state
Buffered amount
Current throughput
RTT
Packets lost
```

This panel should never be visible in production unless explicitly enabled.

---

# 71. Testing

Write tests for:

### Components

- File selector
- Drop zone
- Device card
- Transfer card
- Progress
- Room code
- Recipient selector

### WebRTC

Mock:

```text
RTCPeerConnection
RTCDataChannel
```

Test:

- Offer
- Answer
- ICE
- DataChannel opening
- DataChannel closing
- Transfer start
- Chunk sending
- Backpressure
- Resume
- Failure

### Transfer

Test:

```text
100 MB
1 GB metadata simulation
multiple files
multiple recipients
pause
resume
cancel
```

Do not put actual multi-gigabyte fixtures into the repository.

---

# 72. Performance Testing

Create a development benchmark page:

```text
/dev/benchmark
```

Show:

```text
Connection

Type:
Direct P2P

RTT:
12 ms

Throughput:
87.4 MB/s

Buffered amount:
8 MB

Packet loss:
0.1%
```

Allow a synthetic transfer test without requiring real files.

This will help tune:

- Chunk size
- Buffer threshold
- Concurrency
- UI update frequency

Do not expose the benchmark route in production unless explicitly enabled.

---

# 73. Important Performance Rules

The frontend must be optimized for:

```text
large files
slow devices
mobile devices
unstable connections
fast LAN connections
```

Avoid:

```text
unnecessary React renders
large state objects
Base64
full-file ArrayBuffers
excessive WebSocket messages
unbounded DataChannel buffering
```

---

# 74. No Fake Progress

Never display:

```text
87%
```

if only 50% of the file has actually been transferred.

Progress must come from actual bytes/chunks confirmed by the transfer system.

Likewise, do not display fake transfer speeds.

---

# 75. No Fake P2P

Do not display:

```text
Direct P2P
```

unless the actual WebRTC connection is established and its state supports that conclusion.

Use WebRTC stats where appropriate to determine connection characteristics.

---

# 76. Final Acceptance Criteria

The application is complete when:

### Basic

A user can:

```text
Open website
      ↓
Create room
      ↓
Get room code / QR
      ↓
Open website on phone
      ↓
Join room
      ↓
Devices appear
      ↓
Select file
      ↓
Recipient accepts
      ↓
WebRTC connection established
      ↓
File transfers directly
      ↓
Recipient receives file
```

### Large file

A large file can be transferred without:

```text
loading the entire file into memory
uploading it to FastAPI
Base64 encoding
```

### Performance

The sender uses:

```text
chunking
backpressure
binary DataChannel
adaptive buffering
```

### Reliability

The system supports:

```text
pause
resume
retry
disconnect recovery
```

where browser/network conditions allow.

### Multi-device

A room can contain multiple devices.

Users can choose specific recipients.

### Responsive

Works well on:

```text
phone
tablet
laptop
desktop
```

### Security

Recipient approval works.

Room expiration works.

WebSocket connections are cleaned up.

### Backend integration

The frontend correctly consumes:

```text
/api/v1/rooms
/api/v1/transfers
/api/v1/turn/credentials
/ws/v1/rooms/{room_id}
```

and follows the backend's exact Pydantic/WebSocket contracts.

---

# 77. Implementation Order

Do not attempt to build everything simultaneously.

Implement in this order:

### Phase 1 — Foundation

```text
Next.js
TypeScript
Tailwind
shadcn
layout
API client
environment configuration
```

### Phase 2 — Rooms

```text
Create room
Room code
QR code
Join room
Room expiration
```

### Phase 3 — WebSocket

```text
Connect
Device registration
Device list
Offer
Answer
ICE
```

### Phase 4 — WebRTC

```text
RTCPeerConnection
RTCDataChannel
P2P connection
Connection state
```

### Phase 5 — File transfer

```text
File selection
Chunking
Binary transfer
Backpressure
Progress
Speed
```

### Phase 6 — Reliability

```text
Pause
Resume
Retry
Reconnect
Integrity verification
```

### Phase 7 — Multi-device

```text
Multiple peers
Recipient selection
Concurrent transfer management
```

### Phase 8 — Polish

```text
Responsive design
Animations
Accessibility
Error states
Notifications
Diagnostics
```

### Phase 9 — Testing

```text
Unit tests
Integration tests
WebRTC mocks
Performance benchmarks
Browser testing
```

---

# 78. Final Instruction

Do not merely generate a UI mockup.

Build a **fully functional frontend** that integrates with the FastAPI backend.

The critical functionality is:

```text
FastAPI
   │
   │ WebSocket signaling
   ▼
Browser A
   ═══════════════════
       WebRTC
   ═══════════════════
Browser B
```

The actual file bytes must travel through the WebRTC DataChannel whenever direct P2P is possible.

The application must be designed so that a **10 GB file does not become a 10 GB FastAPI request**.

The backend is the **control plane**.

WebRTC is the **data plane**.

The user experience should make all of this feel effortless:

> **Open → Connect → Select → Send.**
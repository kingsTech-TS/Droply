// Owns every service for one room: signaling, peer links, transfers. Created when the room
// page mounts, disposed when it unmounts. React reads its stores; it never imports React.
import { env } from "@/config/env";
import { closeRoom, getRoom } from "@/lib/api/rooms";
import { isApiError } from "@/lib/api/errors";
import { createTransfer, getTransfer, transferAction } from "@/lib/api/transfers";
import { detectDevice } from "@/lib/device/detection";
import { browserSinkFactory } from "@/lib/storage/sinks/factory";
import { requestPersistence } from "@/lib/storage/quota";
import { Emitter, Store } from "@/lib/utils/emitter";
import { logger } from "@/lib/utils/logger";
import { defaultTuning } from "@/lib/webrtc/adaptive-controller";
import { IceServerProvider } from "@/lib/webrtc/ice";
import { PeerManager } from "@/lib/webrtc/peer-manager";
import { createResumeStore } from "@/lib/webrtc/resume-manager";
import { SignalingClient, type EndReason, type SignalingStatus } from "@/lib/webrtc/signaling-client";
import { TransferManager, type Notice } from "@/lib/webrtc/transfer-manager";
import type { DeviceView } from "@/types/device";
import type { DeviceUpdate, RoomStateEvent, TransferEventType } from "@/types/signaling";
import type { TransferConfigView } from "@/types/transfer";
import { clearSession, type StoredSession } from "./session-store";

export type RoomStatus = "connecting" | "live" | "reconnecting" | "ended";

export interface RoomSnapshot {
  roomId: string;
  roomCode: string;
  joinUrl: string;
  selfId: string;
  hostDeviceId: string | null;
  /** Sliding expiry (ms since epoch); the server extends it while devices are active. */
  expiresAt: number | null;
  status: RoomStatus;
  signaling: SignalingStatus;
  reconnectAttempts: number;
  endReason: EndReason | "expired" | null;
  /** Every device in the room, this one included. */
  devices: DeviceView[];
  online: boolean;
}

export const DEFAULT_TRANSFER_CONFIG: TransferConfigView = {
  recommended_chunk_size: 4 * 1024 * 1024,
  min_chunk_size: 16 * 1024,
  max_chunk_size: 64 * 1024 * 1024,
  max_recipients: 19,
  max_transfer_duration_seconds: 86_400,
  resume_window_seconds: 3600,
  require_recipient_acceptance: true,
  cloud_fallback_enabled: false,
};

const TRANSFER_EVENT_TYPES: readonly TransferEventType[] = [
  "transfer_request",
  "transfer_created",
  "transfer_accepted",
  "transfer_rejected",
  "transfer_connecting",
  "transfer_started",
  "transfer_paused",
  "transfer_resumed",
  "transfer_completed",
  "transfer_failed",
  "transfer_retrying",
  "transfer_cancelled",
  "transfer_expired",
  "transfer_checkpoint",
  "transfer_fallback_ready",
];

export class RoomSession {
  readonly room: Store<RoomSnapshot>;
  readonly notices = new Emitter<{ notice: Notice }>();
  readonly signaling: SignalingClient;
  readonly peers: PeerManager;
  readonly transfers: TransferManager;
  readonly mobile: boolean;

  private readonly ice: IceServerProvider;
  private readonly subs: Array<() => void> = [];
  private readonly connectedOnce = new Set<string>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setTimeout> | null = null;
  private restored = false;
  private disposed = false;
  private wasLive = false;

  constructor(
    readonly session: StoredSession,
    device: DeviceUpdate | undefined,
  ) {
    const detected = detectDevice();
    this.mobile = detected.type === "phone" || detected.type === "tablet";
    this.room = new Store<RoomSnapshot>({
      roomId: session.roomId,
      roomCode: session.roomCode,
      joinUrl: session.joinUrl,
      selfId: session.deviceId,
      hostDeviceId: null,
      expiresAt: null,
      status: "connecting",
      signaling: "idle",
      reconnectAttempts: 0,
      endReason: null,
      devices: [],
      online: typeof navigator === "undefined" ? true : navigator.onLine,
    });

    this.signaling = new SignalingClient({
      wsUrl: env.wsUrl,
      roomId: session.roomId,
      token: session.token,
      device,
    });
    this.ice = new IceServerProvider([], session.token);
    this.peers = new PeerManager({
      selfId: session.deviceId,
      send: (message) => this.signaling.send(message),
      ice: this.ice,
      // Each link lowers this to what both peers and the negotiated SCTP limit allow.
      localMaxFrame: defaultTuning(256 * 1024, this.mobile).frameSize,
    });
    const token = session.token;
    this.transfers = new TransferManager({
      selfId: session.deviceId,
      roomId: session.roomId,
      config: DEFAULT_TRANSFER_CONFIG,
      api: {
        create: (body) => createTransfer(body, token),
        act: (id, action, body) => transferAction(id, action, token, body ?? {}),
        get: (id) => getTransfer(id, token),
      },
      peers: this.peers,
      send: (message) => this.signaling.send(message),
      resume: createResumeStore(),
      sinks: browserSinkFactory,
      mobile: this.mobile,
      deviceName: (id) => this.deviceName(id),
    });
    this.subs.push(this.transfers.notices.on("notice", (notice) => this.notices.emit("notice", notice)));
  }

  start(): void {
    const s = this.signaling;
    this.subs.push(
      s.state.subscribe(() => this.onSignalingState()),
      s.events.on("roomState", (event) => this.onRoomState(event)),
      s.events.on("ended", (reason) => this.onEnded(reason)),
      s.on("peer_joined", ({ device }) => this.upsertDevice(device, true)),
      s.on("peer_updated", ({ device }) => this.upsertDevice(device, false)),
      s.on("peer_left", ({ device_id, reason }) => this.onPeerLeft(device_id, reason)),
      s.on("offer", (m) => void this.peers.handleOffer(m)),
      s.on("answer", (m) => void this.peers.handleAnswer(m)),
      s.on("ice_candidate", (m) => void this.peers.handleCandidate(m)),
      s.on("room_expired", () => this.endRoom("expired")),
      s.on("room_closed", () => this.endRoom("room_ended")),
      this.peers.links.subscribe(() => this.onLinksChanged()),
    );
    for (const type of TRANSFER_EVENT_TYPES) {
      this.subs.push(s.on(type, (event) => this.transfers.handleEvent(event)));
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
      window.addEventListener("offline", this.onOffline);
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    s.connect();
    this.refreshTimer = setInterval(() => void this.refreshRoom(), 60_000);
    this.scheduleStats();
  }

  deviceName(deviceId: string): string {
    return this.room.getSnapshot().devices.find((d) => d.device_id === deviceId)?.device_name ?? "a device";
  }

  /** Leaves for good: the server removes this device and revokes the token. */
  leave(): void {
    this.signaling.leave();
    clearSession(this.session.roomId);
    this.dispose();
  }

  /** Host only: ends the room for everyone. */
  async closeForEveryone(): Promise<void> {
    await closeRoom(this.session.roomId, this.session.token);
  }

  retryConnection(): void {
    this.signaling.retryNow();
  }

  retryPeer(peerId: string): void {
    this.peers.retry(peerId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.subs.splice(0)) off();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("offline", this.onOffline);
      document.removeEventListener("visibilitychange", this.onVisibility);
    }
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.statsTimer) clearTimeout(this.statsTimer);
    this.transfers.dispose();
    this.peers.dispose();
    this.signaling.dispose();
    this.notices.clear();
  }

  // --- event handlers ----------------------------------------------------------------

  private onRoomState(event: RoomStateEvent): void {
    this.ice.setStun(event.ice_servers);
    this.transfers.setConfig(event.transfer_config);
    for (const peer of event.peers) this.peers.setPolite(peer.device_id, peer.polite);
    const devices = event.room.devices;
    // Devices that vanished while we were disconnected.
    const present = new Set(devices.map((d) => d.device_id));
    for (const old of this.room.getSnapshot().devices) {
      if (!present.has(old.device_id)) this.peers.remove(old.device_id);
    }
    this.patch({
      roomCode: event.room.room_code,
      joinUrl: event.room.join_url,
      hostDeviceId: event.room.host_device_id,
      expiresAt: Date.parse(event.room.expires_at) || null,
      devices,
      status: "live",
    });
    if (this.wasLive) {
      this.notices.emit("notice", { kind: "success", message: "Reconnected" });
    }
    this.wasLive = true;
    for (const device of devices) {
      if (device.device_id !== this.session.deviceId && device.connection_state === "connected") {
        this.transfers.onPeerPresent(device.device_id);
      }
    }
    if (!this.restored) {
      this.restored = true;
      void this.transfers.restore();
      void requestPersistence();
    }
  }

  private upsertDevice(device: DeviceView, joined: boolean): void {
    const devices = this.room.getSnapshot().devices.filter((d) => d.device_id !== device.device_id);
    devices.push(device);
    this.patch({ devices, hostDeviceId: device.is_host ? device.device_id : this.room.getSnapshot().hostDeviceId });
    if (device.device_id === this.session.deviceId) return;
    if (device.connection_state === "connected") this.transfers.onPeerPresent(device.device_id);
    if (joined) logger.debug("room", `${device.device_name} joined`);
  }

  private onPeerLeft(deviceId: string, reason: string): void {
    const devices = this.room.getSnapshot().devices.filter((d) => d.device_id !== deviceId);
    const name = this.deviceName(deviceId);
    this.patch({ devices });
    this.peers.remove(deviceId);
    this.connectedOnce.delete(deviceId);
    if (reason === "disconnected" || reason === "timeout") {
      this.notices.emit("notice", { kind: "warning", message: `${name} disconnected.` });
    }
  }

  private onLinksChanged(): void {
    for (const [peerId, info] of Object.entries(this.peers.links.getSnapshot())) {
      if (info.status === "connected" && !this.connectedOnce.has(peerId)) {
        this.connectedOnce.add(peerId);
        this.notices.emit("notice", { kind: "success", message: `Connected to ${this.deviceName(peerId)}` });
      }
    }
  }

  private onSignalingState(): void {
    const state = this.signaling.state.getSnapshot();
    const current = this.room.getSnapshot();
    if (current.status === "ended") return;
    let status: RoomStatus = current.status;
    if (state.status === "open") status = "live";
    else if (state.status === "reconnecting") status = "reconnecting";
    else if (state.status === "connecting") status = current.status === "live" ? "reconnecting" : "connecting";
    if (status === "reconnecting" && current.status === "live") {
      this.notices.emit("notice", { kind: "warning", message: "Connection interrupted. Reconnecting…" });
    }
    this.patch({ signaling: state.status, reconnectAttempts: state.attempts, status });
  }

  private onEnded(reason: EndReason): void {
    if (reason === "gave_up") {
      this.patch({ status: "reconnecting", endReason: "gave_up" });
      return;
    }
    if (reason === "unauthorized" || reason === "removed" || reason === "room_ended" || reason === "room_not_found") {
      clearSession(this.session.roomId);
    }
    this.endRoom(reason);
  }

  private endRoom(reason: EndReason | "expired"): void {
    if (this.room.getSnapshot().status === "ended") return;
    this.patch({ status: "ended", endReason: reason });
    clearSession(this.session.roomId);
    this.transfers.dispose();
    this.peers.dispose();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private async refreshRoom(): Promise<void> {
    if (this.disposed || this.room.getSnapshot().status === "ended") return;
    try {
      const room = await getRoom(this.session.roomId, this.session.token);
      this.patch({ expiresAt: Date.parse(room.expires_at) || null, hostDeviceId: room.host_device_id });
    } catch (error) {
      if (isApiError(error) && (error.code === "ROOM_EXPIRED" || error.code === "ROOM_NOT_FOUND")) {
        this.endRoom("expired");
      }
    }
  }

  private scheduleStats(): void {
    if (this.disposed) return;
    const active = this.transfers.store
      .getSnapshot()
      .items.some((item) => item.legs.some((leg) => leg.status === "transferring" || leg.status === "connecting"));
    this.statsTimer = setTimeout(async () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        await this.peers.refreshStats();
      }
      this.scheduleStats();
    }, active ? 2000 : 10_000);
  }

  private readonly onOnline = (): void => {
    this.patch({ online: true });
    this.signaling.retryNow();
  };

  private readonly onOffline = (): void => {
    this.patch({ online: false });
    this.notices.emit("notice", { kind: "warning", message: "You're offline. Transfers will continue when you're back." });
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState !== "visible") return;
    void this.refreshRoom();
    if (this.signaling.status === "ended" && this.room.getSnapshot().endReason === "gave_up") {
      this.signaling.retryNow();
    }
  };

  private patch(partial: Partial<RoomSnapshot>): void {
    this.room.update((current) => ({ ...current, ...partial }));
  }
}

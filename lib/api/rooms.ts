import type { DeviceInfoIn } from "@/types/device";
import type {
  NearbyRoom,
  RendezvousSession,
  RoomKind,
  RoomSession,
  RoomSettingsUpdate,
  RoomView,
} from "@/types/room";
import { apiClient, type ApiClient } from "./client";

export function createRoom(
  device: DeviceInfoIn,
  client: ApiClient = apiClient,
  kind: RoomKind = "standard",
): Promise<RoomSession> {
  return client.request<RoomSession>("POST", "/rooms", { body: { device, kind } });
}

/** Joins by code. Sending a still-valid token for the same room returns the same device. */
export function joinRoom(
  roomCode: string,
  device: DeviceInfoIn,
  token: string | null = null,
  client: ApiClient = apiClient,
): Promise<RoomSession> {
  return client.request<RoomSession>("POST", "/rooms/join", {
    body: { room_code: roomCode, device },
    token,
  });
}

export function getRoom(roomId: string, token: string, client: ApiClient = apiClient): Promise<RoomView> {
  return client.request<RoomView>("GET", `/rooms/${encodeURIComponent(roomId)}`, {
    token,
    retries: 2,
  });
}

/** Host only: ends the room for everyone. */
export function closeRoom(roomId: string, token: string, client: ApiClient = apiClient): Promise<void> {
  return client.request<void>("DELETE", `/rooms/${encodeURIComponent(roomId)}`, { token });
}

/** Host only: theme and nearby discoverability. Every device receives `room_updated`. */
export function updateRoomSettings(
  roomId: string,
  settings: RoomSettingsUpdate,
  token: string,
  client: ApiClient = apiClient,
): Promise<RoomView> {
  return client.request<RoomView>("PATCH", `/rooms/${encodeURIComponent(roomId)}`, {
    body: settings,
    token,
  });
}

/** Discoverable rooms created from this device's network (same public IP). */
export function getNearbyRooms(client: ApiClient = apiClient): Promise<NearbyRoom[]> {
  return client.request<NearbyRoom[]>("GET", "/rooms/nearby");
}

/**
 * Joins the room shared by everyone holding `key` (paired devices, personal room links),
 * opening one if there is none. No room code needed.
 */
export function rendezvous(
  key: string,
  device: DeviceInfoIn,
  token: string | null = null,
  client: ApiClient = apiClient,
): Promise<RendezvousSession> {
  return client.request<RendezvousSession>("POST", "/rendezvous", { body: { key, device }, token });
}

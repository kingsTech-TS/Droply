import type { DeviceInfoIn } from "@/types/device";
import type { RoomSession, RoomView } from "@/types/room";
import { apiClient, type ApiClient } from "./client";

export function createRoom(device: DeviceInfoIn, client: ApiClient = apiClient): Promise<RoomSession> {
  return client.request<RoomSession>("POST", "/rooms", { body: { device } });
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

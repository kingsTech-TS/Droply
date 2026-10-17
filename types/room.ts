// Mirrors app/schemas/room.py and app/schemas/turn.py in the backend.
import type { DeviceInfoIn, DeviceView } from "./device";
import type { TransferConfigView } from "./transfer";

export type RoomStatus = "open" | "closed" | "expired";

export interface IceServer {
  urls: string[];
  username: string | null;
  credential: string | null;
}

export interface IceConfig {
  ice_servers: IceServer[];
  ttl_seconds: number | null;
  expires_at: string | null;
}

export interface RoomCreateRequest {
  device: DeviceInfoIn;
}

export interface RoomJoinRequest {
  room_code: string;
  device: DeviceInfoIn;
}

export interface RoomView {
  room_id: string;
  room_code: string;
  join_url: string;
  created_at: string;
  expires_at: string;
  max_expires_at: string;
  status: RoomStatus;
  max_devices: number;
  host_device_id: string;
  devices: DeviceView[];
}

/** Returned on room create/join. Holds the device token: keep it private. */
export interface RoomSession {
  room_id: string;
  room_code: string;
  join_url: string;
  expires_at: string;
  device: DeviceView;
  device_token: string;
  token_expires_at: string;
  room: RoomView;
  ice_servers: IceServer[];
  transfer_config: TransferConfigView;
}

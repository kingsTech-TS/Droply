"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CrownIcon, DoorOpenIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDevice } from "@/hooks/use-device";
import { useLocalStore } from "@/hooks/use-local-store";
import { isApiError, userMessage } from "@/lib/api/errors";
import { getRoomStatus, joinRoom } from "@/lib/api/rooms";
import { THEME_STYLES } from "@/lib/fun/themes";
import { forgetRooms, myRooms, rememberRoom, type MyRoom } from "@/lib/session/my-rooms";
import { loadSession, saveSession, toStoredSession } from "@/lib/session/session-store";
import { formatRoomCode } from "@/lib/utils/format";
import type { RoomStatusView } from "@/types/room";

const POLL_MS = 30_000;
/** Without a status answer (older server), rooms older than the server's hard cap are hidden. */
const MAX_ROOM_LIFETIME_MS = 6 * 60 * 60 * 1000;

type Status = { kind: "loading" } | { kind: "known"; rooms: Map<string, RoomStatusView>; at: number } | { kind: "unknown"; at: number };

function endsIn(expiresAt: string, now: number): string | null {
  const minutes = Math.round((Date.parse(expiresAt) - now) / 60_000);
  if (!Number.isFinite(minutes)) return null;
  if (minutes <= 1) return "ends soon unless someone is active";
  return minutes < 60 ? `open for ${minutes} more min` : `open for ${Math.round(minutes / 60)} more h`;
}

/**
 * Rooms this device created or joined that are still open, so leaving a room (without the
 * host closing it, or being removed) never loses it. Creators come back as host.
 */
export function ActiveRooms() {
  const router = useRouter();
  const remembered = useLocalStore(myRooms);
  const { device, commitName } = useDevice();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const refs = remembered.map((r) => `${r.roomId}:${r.roomCode}`).join(",");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const rooms = myRooms.get();
      if (rooms.length > 0 && document.visibilityState === "visible") {
        try {
          const result = await getRoomStatus(rooms.map((r) => ({ room_id: r.roomId, room_code: r.roomCode })));
          if (cancelled) return;
          forgetRooms(result.filter((r) => !r.active).map((r) => r.room_id));
          setStatus({ kind: "known", rooms: new Map(result.map((r) => [r.room_id, r])), at: Date.now() });
        } catch (error) {
          // A server without the status endpoint (404/405): show what we remember.
          if (!cancelled && isApiError(error) && (error.status === 404 || error.status === 405)) {
            setStatus({ kind: "unknown", at: Date.now() });
          }
        }
      }
      if (!cancelled) timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refs]);

  if (status.kind === "loading") return null;
  const visible = remembered.filter((room) =>
    status.kind === "known" ? status.rooms.get(room.roomId)?.active === true : status.at - room.at < MAX_ROOM_LIFETIME_MS,
  );
  if (visible.length === 0) return null;

  const rejoin = async (room: MyRoom) => {
    setBusy(room.roomId);
    try {
      // Still in it in this tab (navigated away without leaving): just go back.
      const existing = loadSession(room.roomId);
      if (existing) {
        router.push(`/room/${encodeURIComponent(room.roomId)}`);
        return;
      }
      const session = await joinRoom(
        room.roomCode,
        {
          device_name: commitName(),
          device_type: device?.type ?? "unknown",
          browser: device?.browser ?? null,
          operating_system: device?.os ?? null,
        },
        null,
        undefined,
        room.hostKey,
      );
      saveSession(toStoredSession(session));
      rememberRoom(session);
      router.push(`/room/${encodeURIComponent(session.room_id)}`);
    } catch (error) {
      if (isApiError(error) && (error.code === "ROOM_EXPIRED" || error.code === "INVALID_ROOM_CODE" || error.code === "ROOM_NOT_FOUND")) {
        forgetRooms([room.roomId]);
        toast.error("That room has ended.");
      } else {
        toast.error(userMessage(error));
      }
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="active-rooms-heading" className="space-y-3">
      <h2 id="active-rooms-heading" className="flex items-center gap-2 font-semibold">
        <DoorOpenIcon aria-hidden className="size-5 text-primary" />
        Your active rooms
      </h2>
      <ul className="grid gap-2">
        {visible.map((room) => {
          const live = status.kind === "known" ? status.rooms.get(room.roomId) : undefined;
          const theme = THEME_STYLES[live?.theme ?? room.theme];
          const details = [
            room.created ? "You created it" : "You joined",
            live?.device_count != null ? (live.device_count === 1 ? "1 device in it" : `${live.device_count} devices in it`) : null,
            live?.expires_at ? endsIn(live.expires_at, status.at) : null,
          ].filter(Boolean);
          return (
            <li key={room.roomId} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl">
                {theme.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  Room <span className="font-mono tracking-wider">{formatRoomCode(room.roomCode)}</span>
                  {room.created ? <CrownIcon aria-label="You're the host" className="size-4 text-warning" /> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{details.join(" · ")}</p>
              </div>
              <Button size="sm" onClick={() => void rejoin(room)} disabled={busy !== null} aria-label={`Rejoin room ${formatRoomCode(room.roomCode)}`}>
                {busy === room.roomId ? "Joining…" : "Rejoin"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => forgetRooms([room.roomId])}
                aria-label={`Remove room ${formatRoomCode(room.roomCode)} from this list`}
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

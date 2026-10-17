"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RadarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeviceAvatar } from "@/components/room/device-avatar";
import { getNearbyRooms } from "@/lib/api/rooms";
import { THEME_STYLES } from "@/lib/fun/themes";
import type { NearbyRoom } from "@/types/room";

const POLL_MS = 8000;

/** Rooms nearby (same network) whose host made them visible. Joining still names the device. */
export function NearbyRooms() {
  const [rooms, setRooms] = useState<NearbyRoom[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (document.visibilityState === "visible") {
        try {
          const found = await getNearbyRooms();
          if (!cancelled) setRooms(found);
        } catch {
          // Discovery is a convenience; stay quiet if the server can't be reached.
        }
      }
      if (!cancelled) timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (rooms.length === 0) return null;
  return (
    <section aria-labelledby="nearby-heading" className="space-y-3">
      <h2 id="nearby-heading" className="flex items-center gap-2 font-semibold">
        <RadarIcon aria-hidden className="size-5 text-primary" />
        Nearby
      </h2>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {rooms.map((room) => (
          <li key={room.room_id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <DeviceAvatar name={room.host_name} type={room.host_device_type} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {room.theme !== "default" ? `${THEME_STYLES[room.theme].emoji} ` : ""}
                {room.host_name}&apos;s room
              </p>
              <p className="text-xs text-muted-foreground">
                {room.device_count === 1 ? "1 device" : `${room.device_count} devices`}
                {room.kind === "event" ? " · event" : ""}
              </p>
            </div>
            <Button asChild size="sm">
              <Link href={`/join/${room.room_code}`}>Join</Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

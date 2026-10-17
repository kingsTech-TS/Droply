"use client";

import Link from "next/link";
import { CircleOffIcon, TimerOffIcon, UserXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoomSnapshot } from "@/lib/session/room-session";

const COPY: Record<string, { title: string; body: string; icon: typeof TimerOffIcon }> = {
  expired: { title: "This room has expired.", body: "Create a new room to continue.", icon: TimerOffIcon },
  room_ended: { title: "This room has ended.", body: "Create a new room to continue.", icon: CircleOffIcon },
  room_not_found: { title: "This room doesn't exist anymore.", body: "Create a new room to continue.", icon: CircleOffIcon },
  removed: { title: "You were removed from this room.", body: "Ask for the room code to join again.", icon: UserXIcon },
  unauthorized: { title: "Your session for this room has ended.", body: "Join again with the room code.", icon: UserXIcon },
  forbidden: { title: "This room can't be opened here.", body: "Try opening the link again.", icon: CircleOffIcon },
  left: { title: "You left the room.", body: "Create a new room or join another one.", icon: CircleOffIcon },
};

export function RoomEnded({ reason }: { reason: RoomSnapshot["endReason"] }) {
  const copy = COPY[reason ?? "room_ended"] ?? COPY.room_ended!;
  const Icon = copy.icon;
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-7" />
      </span>
      <h1 className="text-2xl font-semibold">{copy.title}</h1>
      <p className="text-muted-foreground">{copy.body}</p>
      <Button asChild size="lg">
        <Link href="/">Create new room</Link>
      </Button>
    </div>
  );
}

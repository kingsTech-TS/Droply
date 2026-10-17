"use client";

import type { ReactNode } from "react";
import { CloudOffIcon, LoaderCircleIcon, WifiOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoomSnapshot } from "@/lib/session/room-session";

/** Shown only when the control connection to the server is not healthy. */
export function ConnectionBanner({ room, onRetry }: { room: RoomSnapshot; onRetry: () => void }) {
  let content: ReactNode = null;
  if (!room.online) {
    content = (
      <>
        <WifiOffIcon aria-hidden className="size-4 shrink-0" />
        <span className="flex-1">Connection interrupted. You&apos;re offline; transfers will resume when you&apos;re back.</span>
      </>
    );
  } else if (room.endReason === "gave_up") {
    content = (
      <>
        <CloudOffIcon aria-hidden className="size-4 shrink-0" />
        <span className="flex-1">Can&apos;t reach the server.</span>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </>
    );
  } else if (room.status === "reconnecting") {
    content = (
      <>
        <LoaderCircleIcon aria-hidden className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
        <span className="flex-1">Connection interrupted. Reconnecting…</span>
      </>
    );
  } else if (room.status === "connecting") {
    content = (
      <>
        <LoaderCircleIcon aria-hidden className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
        <span className="flex-1">Connecting to the room…</span>
      </>
    );
  }
  if (!content) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      {content}
    </div>
  );
}

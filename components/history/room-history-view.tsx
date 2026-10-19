"use client";

import { useMemo } from "react";
import { ArrowDownIcon, ArrowUpIcon, MessagesSquareIcon, TimerIcon, UsersIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocalStore } from "@/hooks/use-local-store";
import { THEME_STYLES } from "@/lib/fun/themes";
import { clearRoomHistory, roomHistory, type RoomEndReason, type RoomHistoryEntry } from "@/lib/history/rooms";
import { formatBytes, formatDuration, formatRoomCode } from "@/lib/utils/format";

const ENDED: Record<RoomEndReason, { label: string; variant: "secondary" | "warning" | "outline" }> = {
  expired: { label: "Time ran out", variant: "secondary" },
  closed: { label: "Closed", variant: "secondary" },
  removed: { label: "Removed", variant: "warning" },
  left: { label: "Left", variant: "outline" },
};

const when = (ms: number) =>
  new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function spentSeconds(entry: RoomHistoryEntry): number {
  return Math.max(0, ((entry.endedAt ?? entry.lastSeenAt) - entry.joinedAt) / 1000);
}

/** Rooms this device was in (newest first), with what moved in each. */
export function RoomHistoryView() {
  const entries = useLocalStore(roomHistory);
  const list = useMemo(() => entries.slice().sort((a, b) => b.joinedAt - a.joinedAt), [entries]);
  const totals = useMemo(
    () => ({
      rooms: entries.length,
      hosted: entries.filter((e) => e.host).length,
      seconds: entries.reduce((sum, e) => sum + spentSeconds(e), 0),
      files: entries.reduce((sum, e) => sum + e.sentFiles + e.receivedFiles, 0),
    }),
    [entries],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {totals.rooms === 0 ? (
            "Rooms you create or join show up here."
          ) : (
            <>
              <span className="font-medium text-foreground">{totals.rooms}</span> {totals.rooms === 1 ? "room" : "rooms"} ·{" "}
              <span className="font-medium text-foreground">{totals.hosted}</span> hosted ·{" "}
              <span className="font-medium text-foreground">{formatDuration(totals.seconds)}</span> in rooms ·{" "}
              <span className="font-medium text-foreground">{totals.files}</span> {totals.files === 1 ? "file" : "files"}
            </>
          )}
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={entries.length === 0}>
              Clear rooms
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear your room history?</AlertDialogTitle>
              <AlertDialogDescription>
                Removes the list of rooms you were in from this device. Your transfer history and saved files are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction onClick={clearRoomHistory}>Clear</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {list.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">No rooms yet. They&apos;ll show up here, on this device only.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {list.map((e) => {
            const theme = THEME_STYLES[e.theme];
            const ended = e.endReason ? ENDED[e.endReason] : null;
            const moved = e.sentFiles + e.receivedFiles > 0;
            return (
              <li key={e.roomId} className="flex min-w-0 gap-3 p-3 sm:p-4">
                <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xl">
                  {theme.emoji}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-mono text-sm font-semibold tracking-wider">{formatRoomCode(e.roomCode)}</p>
                    <Badge variant={e.host ? "default" : "outline"}>{e.host ? "Host" : "Joined"}</Badge>
                    {e.kind === "event" ? <Badge variant="electric">Event</Badge> : null}
                    {e.mode === "my-devices" ? <Badge variant="secondary">My devices</Badge> : null}
                    {e.mode === "room-link" ? <Badge variant="secondary">Personal room</Badge> : null}
                    {ended ? <Badge variant={ended.variant}>{ended.label}</Badge> : null}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <time dateTime={new Date(e.joinedAt).toISOString()}>{when(e.joinedAt)}</time>
                    <span aria-hidden>·</span>
                    <span>{formatDuration(spentSeconds(e))} in the room</span>
                    {e.durationSeconds !== null ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1">
                          <TimerIcon aria-hidden className="size-3.5" />
                          {Math.round(e.durationSeconds / 60)} min room{e.timeExtended ? " (time added)" : ""}
                        </span>
                      </>
                    ) : null}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {moved ? (
                      <>
                        <span className="inline-flex items-center gap-1">
                          <ArrowUpIcon aria-hidden className="size-3.5" />
                          {e.sentFiles} sent{e.sentBytes ? ` (${formatBytes(e.sentBytes)})` : ""}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ArrowDownIcon aria-hidden className="size-3.5" />
                          {e.receivedFiles} received{e.receivedBytes ? ` (${formatBytes(e.receivedBytes)})` : ""}
                        </span>
                      </>
                    ) : (
                      <span>No files</span>
                    )}
                    {e.chatMessages > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <MessagesSquareIcon aria-hidden className="size-3.5" />
                        {e.chatMessages} {e.chatMessages === 1 ? "message" : "messages"}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <UsersIcon aria-hidden className="size-3.5" />
                      {e.peakDevices} {e.peakDevices === 1 ? "device" : "devices"}
                    </span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { LogOutIcon, TimerIcon } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { PreferencesButton } from "@/components/layout/preferences-dialog";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useCountdown } from "@/hooks/use-countdown";
import { cn } from "@/lib/utils/cn";
import { formatCountdown, formatRoomCode } from "@/lib/utils/format";

export interface RoomHeaderProps {
  code: string;
  isHost: boolean;
  transfersActive: boolean;
  onLeave: () => void;
  onCloseRoom: () => void;
  /** When the room ends (ms); the timer stays visible in the header. */
  expiresAt?: number | null;
  wrappingUp?: boolean;
}

/** Always-visible room timer for the sticky header. */
function HeaderTimer({ expiresAt, wrappingUp }: { expiresAt: number; wrappingUp: boolean }) {
  const remaining = useCountdown(expiresAt);
  if (remaining === null) return null;
  const up = wrappingUp || remaining === 0;
  const soon = up || remaining < 2 * 60 * 1000;
  const label = up ? "Time's up" : formatCountdown(remaining);
  return (
    <span
      role="timer"
      aria-label={up ? "Room time is up" : `Room ends in ${label}`}
      title={up ? "Time's up" : "Time left in this room"}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium tabular-nums sm:text-sm",
        soon ? "border-warning/50 bg-warning/12 text-warning" : "bg-muted text-foreground",
      )}
    >
      <TimerIcon aria-hidden className="size-3.5 sm:size-4" />
      <span className={up ? undefined : "font-mono"}>{label}</span>
    </span>
  );
}

export function RoomHeader({ code, isHost, transfersActive, onLeave, onCloseRoom, expiresAt = null, wrappingUp = false }: RoomHeaderProps) {
  const [confirm, setConfirm] = useState<"leave" | "close" | null>(null);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6 2xl:max-w-7xl">
        <Logo compact />
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">Room</span>
          <span className="whitespace-nowrap font-mono text-sm font-semibold tracking-wider" aria-label={`Room ${code}`}>
            {formatRoomCode(code)}
          </span>
          {expiresAt !== null ? <HeaderTimer expiresAt={expiresAt} wrappingUp={wrappingUp} /> : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (transfersActive || isHost ? setConfirm("leave") : onLeave())}
            aria-label="Leave room"
          >
            <LogOutIcon aria-hidden />
            <span className="hidden sm:inline">Leave</span>
          </Button>
          <PreferencesButton />
          <ThemeToggle />
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "close" ? "Close the room for everyone?" : "Leave this room?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "close"
                ? "Every device is disconnected and unfinished transfers stop."
                : `${transfersActive ? "Transfers to and from this device will stop. " : ""}The room stays open: find it under Your active rooms on the home page to come back${
                    isHost ? " as host" : ""
                  }.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            {isHost && confirm === "leave" ? (
              <Button
                variant="outline"
                onClick={() => {
                  setConfirm("close");
                }}
              >
                Close for everyone
              </Button>
            ) : null}
            <AlertDialogAction
              onClick={() => {
                if (confirm === "close") onCloseRoom();
                else onLeave();
                setConfirm(null);
              }}
            >
              {confirm === "close" ? "Close room" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}

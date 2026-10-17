"use client";

import { useState } from "react";
import { LogOutIcon } from "lucide-react";
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
import { formatRoomCode } from "@/lib/utils/format";

export interface RoomHeaderProps {
  code: string;
  isHost: boolean;
  transfersActive: boolean;
  onLeave: () => void;
  onCloseRoom: () => void;
}

export function RoomHeader({ code, isHost, transfersActive, onLeave, onCloseRoom }: RoomHeaderProps) {
  const [confirm, setConfirm] = useState<"leave" | "close" | null>(null);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Logo />
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">Room</span>
          <span className="font-mono text-sm font-semibold tracking-wider" aria-label={`Room ${code}`}>
            {formatRoomCode(code)}
          </span>
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
                : transfersActive
                  ? "Transfers to and from this device will stop."
                  : "You can join again with the room code while the room is open."}
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

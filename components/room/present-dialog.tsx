"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatRoomCode } from "@/lib/utils/format";
import { QrCode } from "./qr-code";
import { RoomCountdown } from "./room-countdown";

/** Full-screen QR code for scanning from across the room (events, classes). */
export function PresentDialog({
  open,
  onOpenChange,
  code,
  joinUrl,
  expiresAt,
  devices,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  joinUrl: string;
  expiresAt: number | null;
  devices: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[100dvh] max-h-none w-screen max-w-none place-items-center rounded-none border-0 sm:h-[95dvh] sm:w-[95vw] sm:rounded-2xl">
        <div className="flex flex-col items-center gap-6 text-center">
          <DialogTitle className="text-3xl font-semibold sm:text-4xl">Scan to join</DialogTitle>
          <DialogDescription className="sr-only">QR code and room code for joining this room</DialogDescription>
          <QrCode value={joinUrl} size={Math.min(480, typeof window === "undefined" ? 320 : Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.55))} />
          <p className="font-mono text-5xl font-semibold tracking-[0.25em] sm:text-7xl" aria-label={`Room code ${code.split("").join(" ")}`}>
            {formatRoomCode(code)}
          </p>
          <p className="text-lg text-muted-foreground">
            {devices === 1 ? "1 device joined" : `${devices} devices joined`} · or open {joinUrl.replace(/^https?:\/\//, "").replace(/\/join\/.*/, "")}
          </p>
          <RoomCountdown expiresAt={expiresAt} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { ChevronDownIcon, QrCodeIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { QrCode } from "./qr-code";
import { RoomCode } from "./room-code";
import { RoomCountdown } from "./room-countdown";

export interface RoomSharePanelProps {
  code: string;
  joinUrl: string;
  expiresAt: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Room code, QR code and expiry. Collapsible once other devices have joined. */
export function RoomSharePanel({ code, joinUrl, expiresAt, open, onOpenChange }: RoomSharePanelProps) {
  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-5 py-3 text-left hover:bg-accent/50">
          <span className="flex items-center gap-2 font-semibold">
            <QrCodeIcon aria-hidden className="size-5 text-primary" />
            {open ? "Your room is ready" : "Add another device"}
          </span>
          <ChevronDownIcon
            aria-hidden
            className={`size-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col items-center gap-5 px-5 pb-6 pt-2">
            <RoomCode code={code} joinUrl={joinUrl} />
            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground" aria-hidden>
              <span className="h-px w-10 bg-border" /> or <span className="h-px w-10 bg-border" />
            </div>
            <QrCode value={joinUrl} size={176} />
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Scan this QR code with another device, or open the link and enter the code.
            </p>
            <RoomCountdown expiresAt={expiresAt} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

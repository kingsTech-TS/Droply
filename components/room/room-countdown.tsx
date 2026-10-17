"use client";

import { TimerIcon } from "lucide-react";
import { useCountdown } from "@/hooks/use-countdown";
import { formatCountdown } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/**
 * The room's expiry is sliding: the server extends it while devices are active, so the
 * value refreshes from the server and can move forward.
 */
export function RoomCountdown({ expiresAt, className }: { expiresAt: number | null; className?: string }) {
  const remaining = useCountdown(expiresAt);
  if (remaining === null) return null;
  const soon = remaining < 2 * 60 * 1000;
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground", soon && "text-warning", className)}>
      <TimerIcon aria-hidden className="size-4" />
      {remaining === 0 ? (
        "Room expired"
      ) : (
        <>
          Room expires in <span className="font-mono tabular-nums">{formatCountdown(remaining)}</span>
        </>
      )}
    </p>
  );
}

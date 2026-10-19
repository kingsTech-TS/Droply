"use client";

import { TimerIcon } from "lucide-react";
import { useCountdown } from "@/hooks/use-countdown";
import { formatCountdown } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/**
 * Timed rooms end at a fixed time (the host may add time once). Other rooms have a sliding
 * expiry: the server extends it while devices are active, so the value can move forward.
 */
export function RoomCountdown({
  expiresAt,
  wrappingUp = false,
  className,
}: {
  expiresAt: number | null;
  wrappingUp?: boolean;
  className?: string;
}) {
  const remaining = useCountdown(expiresAt);
  if (remaining === null) return null;
  const soon = remaining < 2 * 60 * 1000;
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground", soon && "text-warning", className)}>
      <TimerIcon aria-hidden className="size-4" />
      {wrappingUp ? (
        "Time's up · finishing transfers"
      ) : remaining === 0 ? (
        "Time's up"
      ) : (
        <>
          Room ends in <span className="font-mono tabular-nums">{formatCountdown(remaining)}</span>
        </>
      )}
    </p>
  );
}

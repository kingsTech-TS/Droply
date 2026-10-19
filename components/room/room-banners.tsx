"use client";

import { HourglassIcon, SmartphoneIcon, TimerIcon, TimerOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCountdown } from "@/hooks/use-countdown";
import { formatCountdown } from "@/lib/utils/format";

/** Phones pause background tabs, which stops WebRTC. */
export function KeepTabOpenBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-xl border bg-accent/60 px-4 py-3 text-sm">
      <SmartphoneIcon aria-hidden className="size-4 shrink-0 text-accent-foreground" />
      Keep this tab open until the transfer finishes. If it&apos;s interrupted, it continues from where it stopped.
    </div>
  );
}

const SOON_MS = 2 * 60 * 1000;

/**
 * A timed room is about to end. The host can add time if they haven't yet; everyone else
 * just gets the heads-up.
 */
export function TimedRoomEndingPrompt({
  expiresAt,
  timeUp,
  onAddTime,
  lockedReason,
}: {
  expiresAt: number | null;
  timeUp: boolean;
  /** Host only, while time can still be added. */
  onAddTime?: () => void;
  /** Shown to the host when time can't be added any more. */
  lockedReason?: string | null;
}) {
  const remaining = useCountdown(expiresAt);
  if (timeUp || remaining === null || remaining === 0 || remaining > SOON_MS) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <TimerIcon aria-hidden className="size-4 shrink-0 text-warning" />
      <span className="flex-1">
        This room ends in <span className="font-mono tabular-nums">{formatCountdown(remaining)}</span>.{" "}
        {onAddTime ? null : lockedReason ? lockedReason : "Files still on their way when time runs out will finish."}
      </span>
      {onAddTime ? (
        <Button size="sm" variant="outline" onClick={onAddTime}>
          <HourglassIcon aria-hidden />
          Add time
        </Button>
      ) : null}
    </div>
  );
}

/** Time is up: running transfers finish, nothing new can be sent, then the room closes. */
export function TimeUpBanner({ show, transfersRunning }: { show: boolean; transfersRunning: boolean }) {
  if (!show) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <TimerOffIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="space-y-0.5">
        <p className="font-medium">Time&apos;s up for this room.</p>
        <p className="text-muted-foreground">
          {transfersRunning
            ? "Files already on their way will finish, then the room closes. Nothing new can be sent."
            : "The room is closing. Nothing new can be sent."}
        </p>
      </div>
    </div>
  );
}

/** Offered when an idle room is about to expire. */
export function ExpiryPrompt({ expiresAt, onKeepOpen }: { expiresAt: number | null; onKeepOpen: () => void }) {
  const remaining = useCountdown(expiresAt);
  if (remaining === null || remaining === 0 || remaining > SOON_MS) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <TimerIcon aria-hidden className="size-4 shrink-0 text-warning" />
      <span className="flex-1">
        This room expires in <span className="font-mono tabular-nums">{formatCountdown(remaining)}</span>. Keep it open?
      </span>
      <Button size="sm" variant="outline" onClick={onKeepOpen}>
        Keep open
      </Button>
    </div>
  );
}

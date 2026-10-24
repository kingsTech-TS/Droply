"use client";

import { SmartphoneIcon, TimerIcon } from "lucide-react";
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
